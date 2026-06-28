// Add listener for the message from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "RUN_QA") return true; // Use true to indicate async response

    (async () => {
        const report = {
            forcedReflows: [],
            layoutThrashing: [],
            heavyFunctions: [], // Renamed from 'heavyResources' for clarity, will store JS functions/resources
            thirdPartyBlocking: {},
            longTasks: [],
            biggestNodes: [],
            LCP: { startTime: null, element: null, size: null, resourceType: null, resourceUrl: null, downloadTime: null },
            CLS: 0,
            memorySnapshot: { usedJSHeapSize: 0, totalJSHeapSize: 0, used: 0 } // Placeholder for memory
        };

        let score = 100;
        const issues = [];
        const cleanupFunctions = []; // Store functions to restore prototypes

        // Helper to add issues and adjust score
        const addIssue = (description, pointsToDeduct = 5) => {
            issues.push(description);
            score -= pointsToDeduct;
            if (score < 0) score = 0;
        };

        /* ---------------- Performance Observer (LCP, CLS, Long Tasks) ---------------- */
        const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                if (entry.entryType === "largest-contentful-paint") {
                    report.LCP.startTime = entry.startTime;
                    report.LCP.element = entry.element;
                    report.LCP.size = entry.size;
                    report.LCP.resourceType = entry.element?.tagName;

                    // Try to find the resource related to LCP element
                    const resources = performance.getEntriesByType("resource");
                    let lcpResource = null;
                    if (entry.element && entry.element.src) { // e.g., for <img>
                        lcpResource = resources.find(r => r.name === entry.element.src);
                    } else if (entry.element && window.getComputedStyle(entry.element).backgroundImage) { // e.g., for background-image
                        const bgImageUrl = window.getComputedStyle(entry.element).backgroundImage.slice(5, -2); // Remove url()
                        if (bgImageUrl) lcpResource = resources.find(r => r.name === bgImageUrl);
                    }

                    if (lcpResource) {
                        report.LCP.resourceUrl = lcpResource.name;
                        report.LCP.downloadTime = lcpResource.duration;
                    }

                } else if (entry.entryType === "layout-shift" && !entry.hadRecentInput) {
                    report.CLS += entry.value;
                } else if (entry.entryType === "longtask") {
                    report.longTasks.push({ duration: entry.duration, startTime: entry.startTime });
                    const attribution = entry.attribution?.[0];
                    const name = attribution?.name || "unknown";
                    const url = attribution?.url || "unknown";
                    const key = `${name} (${url})`; // Use URL for better distinction

                    if (!report.thirdPartyBlocking[key]) {
                        report.thirdPartyBlocking[key] = { totalDuration: 0, count: 0 };
                    }
                    report.thirdPartyBlocking[key].totalDuration += entry.duration;
                    report.thirdPartyBlocking[key].count++;
                }
            }
        });

        // Observe immediately for buffered entries and future entries
        observer.observe({ type: "largest-contentful-paint", buffered: true });
        observer.observe({ type: "layout-shift", buffered: true });
        observer.observe({ type: "longtask", buffered: true });

        /* ---------------- Forced Reflow / Layout Read Hook ---------------- */
        const originalGetters = {};
        const layoutReads = ["offsetWidth", "offsetHeight", "offsetTop", "offsetLeft", "scrollTop", "scrollLeft", "clientTop", "clientLeft"]; // Added more common reads

        layoutReads.forEach(prop => {
            const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
            if (descriptor && descriptor.get) {
                originalGetters[prop] = descriptor.get;
                Object.defineProperty(HTMLElement.prototype, prop, {
                    get() {
                        // Check if this read is part of a known reflow or thrashing pattern
                        // For now, just record it. More advanced detection would analyze call stacks.
                        report.forcedReflows.push(prop);
                        return originalGetters[prop].call(this);
                    },
                    configurable: true // Make sure it can be redefined later
                });
                cleanupFunctions.push(() => { // Add to cleanup list
                    if (originalGetters[prop]) {
                        Object.defineProperty(HTMLElement.prototype, prop, { get: originalGetters[prop] });
                    }
                });
            }
        });

        const origgetBoundingClientRect = Element.prototype.getBoundingClientRect;
        if (origgetBoundingClientRect) {
            Element.prototype.getBoundingClientRect = function(...args) {
                report.forcedReflows.push("getBoundingClientRect");
                return origgetBoundingClientRect.apply(this, args);
            };
            cleanupFunctions.push(() => { // Add to cleanup list
                Element.prototype.getBoundingClientRect = origgetBoundingClientRect;
            });
        }

        /* ---------------- MutationObserver for Layout Thrashing ---------------- */
        let mutationCount = 0;
        let lastMutationTime = performance.now();
        const mutationBatch = [];
        const MAX_MUTATIONS_PER_BATCH = 5; // Threshold for a "batch"
        const THROTTLING_TIME_MS = 50; // Time window for mutations to be considered "thrashing"

        const mo = new MutationObserver(mutations => {
            const now = performance.now();
            mutationCount += mutations.length;
            mutationBatch.push(...mutations);

            if (mutationBatch.length >= MAX_MUTATIONS_PER_BATCH || (now - lastMutationTime > THROTTLING_TIME_MS)) {
                // Heuristic: If many mutations happen in a short time, it might be thrashing
                if (mutationBatch.length > 5 && (now - lastMutationTime < THROTTLING_TIME_MS * 2)) {
                     report.layoutThrashing.push({ count: mutationBatch.length, timeWindow: now - lastMutationTime });
                }
                mutationBatch.length = 0; // Clear the batch
                lastMutationTime = now;
            }
        });
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        cleanupFunctions.push(() => mo.disconnect());


        /* ---------------- Heavy Resources (JS, CSS, Images) ---------------- */
        performance.getEntriesByType("resource").forEach(res => {
            const isScript = res.initiatorType === 'script';
            const isStylesheet = res.initiatorType === 'link' && res.name.endsWith('.css');
            const isImage = res.initiatorType === 'img';
            const sizeThreshold = isScript ? 150 * 1024 : (isStylesheet ? 100 * 1024 : (isImage ? 200 * 1024 : 50 * 1024)); // Thresholds in bytes
            const durationThreshold = 500; // ms

            if (res.transferSize > sizeThreshold || res.duration > durationThreshold) {
                report.heavyFunctions.push({ // Reusing heavyFunctions for clarity
                    name: res.name,
                    type: res.initiatorType,
                    size: res.transferSize,
                    duration: res.duration,
                    isBlocking: isScript || isStylesheet // Scripts/stylesheets are often blocking
                });
                if (res.transferSize > sizeThreshold) addIssue(`Heavy resource: ${res.name} (${(res.transferSize / 1024).toFixed(1)} KB)`, 3);
                if (res.duration > durationThreshold) addIssue(`Slow resource: ${res.name} (${res.duration.toFixed(0)} ms)`, 3);
            }
        });

        /* ---------------- DOM Size & Nodes ---------------- */
        const DOM_NODE_THRESHOLD = 1500; // Arbitrary threshold for "too many nodes"
        const DOM_DEPTH_THRESHOLD = 30; // Arbitrary threshold for "too deep"
        const BIG_NODE_SIZE_THRESHOLD = 100; // Threshold for node count in subtree (heuristic)

        const body = document.body;
        if (body) {
            const nodeCount = body.getElementsByTagName('*').length;
            report.biggestNodes.push({ type: 'totalNodeCount', value: nodeCount });
            if (nodeCount > DOM_NODE_THRESHOLD) addIssue(`Excessive DOM nodes: ${nodeCount}`, 7);

            // Simple depth check (can be slow on very large DOMs)
            let maxDepth = 0;
            const findDepth = (node, depth) => {
                maxDepth = Math.max(maxDepth, depth);
                for (let i = 0; i < node.children.length; i++) {
                    findDepth(node.children[i], depth + 1);
                }
            };
            findDepth(body, 0);
            report.biggestNodes.push({ type: 'maxDepth', value: maxDepth });
            if (maxDepth > DOM_DEPTH_THRESHOLD) addIssue(`Excessive DOM depth: ${maxDepth}`, 5);

            // Could add logic here to find specific large nodes by checking subtree counts, etc.
        }

        /* ---------------- Memory Snapshot (Basic) ---------------- */
        if (window.performance && window.performance.memory) {
            const mem = window.performance.memory;
            report.memorySnapshot = {
                usedJSHeapSize: mem.usedJSHeapSize,
                totalJSHeapSize: mem.totalJSHeapSize,
                used: (mem.usedJSHeapSize / (1024 * 1024)).toFixed(2) + ' MB'
            };
            if (mem.usedJSHeapSize > 500 * 1024 * 1024) addIssue(`High JS Heap Size: ${(mem.usedJSHeapSize / (1024 * 1024)).toFixed(2)} MB`, 4);
        }

        /* ---------------- Simulate scroll (trigger lazy loading & observe) ---------------- */
        // Scroll smoothly to trigger lazy loading and ensure observations capture changes
        const scrollPromise = new Promise(resolve => {
            const totalHeight = document.documentElement.scrollHeight;
            const scrollStep = totalHeight / 8; // More steps for smoother observation
            let currentScroll = 0;
            let scrollCount = 0;
            const maxScrolls = 8;

            const scrollInterval = setInterval(() => {
                currentScroll += scrollStep;
                window.scrollTo(0, Math.min(currentScroll, totalHeight));
                scrollCount++;

                if (scrollCount >= maxScrolls) {
                    clearInterval(scrollInterval);
                    // Scroll back to top
                    window.scrollTo(0, 0);
                    // Give some time for any final events to fire
                    setTimeout(resolve, 500);
                }
            }, 200); // Adjust interval for smoothness vs speed
        });

        await scrollPromise;

        /* ---------------- Finalize & Cleanup ---------------- */
        observer.disconnect();
        cleanupFunctions.forEach(cleanup => {
            try { cleanup(); } catch (e) { console.error("Cleanup error:", e); }
        });

        /* ---------------- Score Logic & Issue Building ---------------- */

        // LCP Score adjustment
        if (report.LCP.startTime !== null) {
            if (report.LCP.startTime > 4000) addIssue(`LCP time is high: ${(report.LCP.startTime).toFixed(2)}ms`, 10);
            if (report.LCP.downloadTime && report.LCP.downloadTime > 1500) addIssue(`LCP resource download time is high: ${(report.LCP.downloadTime).toFixed(0)}ms`, 5);
            if (report.LCP.resourceType === 'IMG' && report.LCP.size !== null && report.LCP.size > 500 * 1024) addIssue(`LCP image is very large: ${(report.LCP.size / 1024).toFixed(1)} KB`, 5);
        } else {
            addIssue("LCP not detected.", 5);
        }

        // CLS Score adjustment
        if (report.CLS > 0.1) addIssue(`Cumulative Layout Shift (CLS) is high: ${report.CLS.toFixed(4)}`, 10);
        if (report.CLS > 0.25) addIssue(`CLS is very high: ${report.CLS.toFixed(4)}`, 5); // Additional penalty

        // Long Tasks Score adjustment
        if (report.longTasks.length > 3) addIssue(`Too many long tasks (${report.longTasks.length}) detected.`, 8);
        if (report.longTasks.length > 5) addIssue(`Excessive long tasks (${report.longTasks.length}) detected.`, 5);

        // Forced Reflow / Thrashing Score adjustment
        if (report.forcedReflows.length > 5) addIssue(`Frequent forced reflows (${report.forcedReflows.length} times).`, 5);
        if (report.layoutThrashing.length > 1) addIssue(`Layout thrashing detected (${report.layoutThrashing.length} instances).`, 8);

        // Third-party Blocking Score adjustment
        const sortedBlocking = Object.entries(report.thirdPartyBlocking)
            .map(([key, value]) => ({ key, ...value })) // Structure for easier sorting
            .sort((a, b) => b.totalDuration - a.totalDuration);

        if (sortedBlocking.length > 0 && sortedBlocking[0].totalDuration > 500) {
            addIssue(`Major blocking resource: ${sortedBlocking[0].key.split(' (')[0]} (${(sortedBlocking[0].totalDuration).toFixed(0)}ms)`, 10);
        } else if (sortedBlocking.length > 0 && sortedBlocking[0].totalDuration > 200) {
            addIssue(`Potential blocking resource: ${sortedBlocking[0].key.split(' (')[0]} (${(sortedBlocking[0].totalDuration).toFixed(0)}ms)`, 5);
        }

        // Heavy Resource Score adjustment
        const blockingResources = report.heavyFunctions.filter(r => r.isBlocking);
        if (blockingResources.length > 3) addIssue(`Multiple blocking resources detected.`, 5);
        if (report.heavyFunctions.length > 5) addIssue(`Multiple heavy resources detected.`, 3);


        // Final score adjustment if no issues were added but metrics are borderline
        if (issues.length === 0) {
             if (report.CLS > 0.05) score -= 2;
             if (report.LCP.startTime !== null && report.LCP.startTime > 2500) score -= 2;
             if (report.longTasks.length > 1) score -= 2;
        }

        // Ensure score is not negative
        score = Math.max(0, Math.round(score));

        /* ---------------- Send Response ---------------- */
        sendResponse({
            score,
            issues,
            report // Send the full report for potential further analysis or display
        });

    })().catch(error => {
        console.error("Error in QA script execution:", error);
        // Send an error response back to the popup
        sendResponse({
            score: 0,
            issues: [`QA script failed: ${error.message}`],
            report: { error: error.message }
        });
    });

    return true; // Keep the message channel open for async response
});

// --- Placeholder functions/objects that might be needed ---
// These are defined here to avoid 'undefined' errors if they are called
// within the async IIFE before being fully defined or during cleanup.
// In a real scenario, these would be properly managed or not needed if
// the script is injected correctly.

// Example: If a third-party script tries to redefine a prototype that we've hooked,
// and our cleanup fails or runs too late, this placeholder might prevent errors.
// This is a safety net, not a primary solution.

// Ensure basic browser APIs are available
if (typeof performance === 'undefined') {
    globalThis.performance = { getEntriesByType: () => [], now: () => Date.now() };
}
if (typeof PerformanceObserver === 'undefined') {
    globalThis.PerformanceObserver = class {
        constructor() { this.disconnect = () => {}; }
        observe() {}
    };
}
if (typeof MutationObserver === 'undefined') {
    globalThis.MutationObserver = class {
        constructor() { this.disconnect = () => {}; }
        observe() {}
    };
}
