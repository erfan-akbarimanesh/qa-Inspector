const btn = document.getElementById("scanBtn");
const scoreBox = document.querySelector(".score");
const issuesBox = document.querySelector(".issues");
const detailsBox = document.getElementById('reportDetails');

// --- Helper function to shorten URLs ---
function shortenUrl(url, maxLength = 60) {
    if (!url || url.length <= maxLength) {
        return url;
    }
    try {
        const urlObj = new URL(url);
        let hostname = urlObj.hostname;
        const pathname = urlObj.pathname;

        // Specific handling for common local dev patterns
        if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) {
            hostname = hostname.replace(/^www\./, '');
            // Try to remove common build/versioning paths
            const commonPathSegments = ['build', 'dist', 'static', 'assets', '@'];
            let pathParts = pathname.split('/').filter(part => part.length > 0 && !commonPathSegments.includes(part.toLowerCase()) && !part.startsWith('@') && !/\d+\.\d+\.\d+/.test(part));
            let shortPath = pathParts.join('/');

            if (shortPath.length > 30) {
                shortPath = shortPath.substring(0, 27) + "...";
            }
             let shortUrl = `${hostname}/${shortPath}`;
             if (shortUrl.length > maxLength) {
                 shortUrl = shortUrl.substring(0, maxLength - 3) + "...";
             }
             return shortUrl;

        } else {
            // General shortening for other URLs
            hostname = hostname.replace(/^www\./, '');
            if (hostname.length > 20) {
                hostname = hostname.substring(0, 17) + "...";
            }
            let shortPath = pathname.length > 30 ? pathname.substring(0, 27) + "..." : pathname;
            let shortUrl = `${hostname}${shortPath}`;
            if (shortUrl.length > maxLength) {
                 shortUrl = shortUrl.substring(0, maxLength - 3) + "...";
            }
            return shortUrl;
        }

    } catch (e) {
        // Fallback to simple truncation
        return url.substring(0, maxLength) + "...";
    }
}

// --- Helper function to create expandable details (kept for future use, but not used in issue display now) ---
function createDetailsExpander(label, details, elementToAppend) {
    const container = document.createElement('div');
    container.style.marginBottom = '10px';
    container.style.borderBottom = '1px dashed #eee';
    container.style.paddingBottom = '5px';

    const summary = document.createElement('summary');
    summary.style.cursor = 'pointer';
    summary.style.fontWeight = 'bold';
    summary.style.color = '#007bff';
    summary.textContent = `${label} (Show Details)`;

    const content = document.createElement('div');
    content.style.display = 'none';
    content.style.marginTop = '5px';
    content.style.marginLeft = '15px';
    content.style.fontSize = '0.9em';
    content.style.color = '#555';
    content.textContent = details; // Plain text for now

    summary.onclick = () => {
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
        summary.textContent = content.style.display === 'none'
            ? `${label} (Show Details)`
            : `${label} (Hide Details)`;
    };

    container.appendChild(summary);
    container.appendChild(content);
    elementToAppend.appendChild(container);

    return content; // Return the content div for population
}


// Initialize detailsBox if it doesn't exist
if (!detailsBox) {
    const newDetailsBox = document.createElement('div');
    newDetailsBox.id = 'reportDetails';
    newDetailsBox.style.marginTop = '20px';
    newDetailsBox.style.borderTop = '1px solid #eee';
    newDetailsBox.style.paddingTop = '10px';
    document.body.appendChild(newDetailsBox);
    window.detailsBox = newDetailsBox;
} else {
    window.detailsBox = detailsBox;
}


btn.onclick = async () => {
    btn.disabled = true;
    scoreBox.textContent = "Scanning...";
    issuesBox.innerHTML = "";
    window.detailsBox.innerHTML = ""; // Clear previous report details

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || tab.url.startsWith("chrome://") || tab.url.startsWith("about:") || tab.url.startsWith("edge://") || tab.url.startsWith("javascript:")) {
            scoreBox.textContent = "Cannot scan restricted pages.";
            btn.disabled = false;
            return;
        }

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: runAdvancedQA // Ensure this function is globally available or passed correctly
        });

        if (results && results[0] && results[0].result) {
            const { score, issues, report } = results[0].result;

            scoreBox.textContent = `Page health: ${score}/100`;

            if (issues && issues.length > 0) {
                issues.forEach(issue => {
                    const li = document.createElement("li");
                    // Apply shortening to issue messages that contain URLs
                    li.innerHTML = issue.replace(/(https?:\/\/[^\s]+)/g, (match) => shortenUrl(match));
                    issuesBox.appendChild(li);
                });
            } else {
                const li = document.createElement("li");
                li.textContent = "No major issues found.";
                issuesBox.appendChild(li);
            }

            // --- Display detailed report (using shortenUrl for URLs here too) ---
            let detailsHtml = '<h3>Detailed Report:</h3>';

            // LCP Details
            if (report.LCP && report.LCP.startTime !== null) {
                detailsHtml += `<h4>Largest Contentful Paint (LCP)</h4>
                                <p><strong>Time:</strong> ${(report.LCP.startTime).toFixed(2)}ms</p>
                                <p><strong>Element Type:</strong> ${report.LCP.resourceType || 'N/A'}</p>
                                <p><strong>Element Size:</strong> ${report.LCP.size ? (report.LCP.size / 1024).toFixed(1) + ' KB' : 'N/A'}</p>`;

                if (report.LCP.resourceUrl) {
                    const shortLcpUrl = shortenUrl(report.LCP.resourceUrl);
                    detailsHtml += `<p><strong>Resource URL:</strong> ${shortLcpUrl} 
                                    </p>`;
                } else {
                    detailsHtml += `<p><strong>Resource URL:</strong> N/A</p>`;
                }
                 detailsHtml += `<p><strong>Resource Download Time:</strong> ${report.LCP.downloadTime ? report.LCP.downloadTime.toFixed(0) + 'ms' : 'N/A'}</p>`;
            } else {
                detailsHtml += '<p>LCP data not available.</p>';
            }

            // CLS Details
            detailsHtml += `<h4>Cumulative Layout Shift (CLS)</h4>
                            <p><strong>Total CLS:</strong> ${report.CLS.toFixed(4)}</p>`;

            // Long Tasks Details
            if (report.longTasks && report.longTasks.length > 0) {
                detailsHtml += `<h4>Long Tasks (${report.longTasks.length})</h4><ul>`;
                report.longTasks.forEach(task => {
                    detailsHtml += `<li><strong>Duration:</strong> ${task.duration.toFixed(0)}ms, <strong>Start:</strong> ${task.startTime.toFixed(2)}ms</li>`;
                });
                detailsHtml += '</ul>';
            } else {
                detailsHtml += '<p>No long tasks detected.</p>';
            }

            // Forced Reflows & Layout Thrashing
            if (report.forcedReflows && report.forcedReflows.length > 0) {
                const uniqueForcedReflows = [...new Set(report.forcedReflows)]; // Show unique reflow triggers
                 detailsHtml += `<h4>Forced Reflows (${uniqueForcedReflows.length} unique triggers)</h4>
                                <p>${uniqueForcedReflows.join(', ')}</p>`;
            }
            if (report.layoutThrashing && report.layoutThrashing.length > 0) {
                detailsHtml += `<h4>Layout Thrashing</h4><p>Detected ${report.layoutThrashing.length} potential instances.</p>`;
            }

            // Heavy Resources / Functions
            if (report.heavyFunctions && report.heavyFunctions.length > 0) {
                detailsHtml += `<h4>Heavy Resources / Functions</h4><ul>`;
                report.heavyFunctions.slice(0, 5).forEach(res => {
                    const shortName = shortenUrl(res.name, 50);
                    detailsHtml += `<li><strong>Name:</strong> ${shortName} (${res.type}, ${(res.size / 1024).toFixed(1)} KB, ${res.duration.toFixed(0)}ms) ${res.isBlocking ? '[Blocking]' : ''}</li>`;
                });
                 if (report.heavyFunctions.length > 5) detailsHtml += `<li>...and ${report.heavyFunctions.length - 5} more.</li>`;
                detailsHtml += '</ul>';
            }

            // Third-Party Blocking
            if (report.thirdPartyBlocking && Object.keys(report.thirdPartyBlocking).length > 0) {
                detailsHtml += `<h4>Third-Party Blocking Analysis</h4><ul>`;
                const sortedBlocking = Object.entries(report.thirdPartyBlocking)
                    .map(([key, value]) => ({ key, ...value }))
                    .sort((a, b) => b.totalDuration - a.totalDuration);

                sortedBlocking.slice(0, 5).forEach(item => {
                    // Attempt to get a cleaner name, fallback to key
                    const friendlyName = item.key.includes(' (') ? item.key.split(' (')[0] : item.key;
                    const shortName = shortenUrl(friendlyName, 40);
                    detailsHtml += `<li><strong>${shortName}</strong> (${item.count} tasks, Total: ${item.totalDuration.toFixed(0)}ms)
                                    <button onclick="console.log('Full Third-Party Blocking Info for ${friendlyName}:', ${JSON.stringify(item)}); alert('Details for ${friendlyName} logged to console.')" style="margin-left: 10px; padding: 2px 5px; cursor:pointer;">Details</button></li>`;
                });
                 if (sortedBlocking.length > 5) detailsHtml += `<li>...and ${sortedBlocking.length - 5} more.</li>`;
                detailsHtml += '</ul>';
            }

            // Memory Snapshot
             if (report.memorySnapshot && report.memorySnapshot.usedJSHeapSize) {
                detailsHtml += `<h4>Memory Snapshot</h4>
                                <p><strong>Used Heap:</strong> ${(report.memorySnapshot.usedJSHeapSize / (1024 * 1024)).toFixed(2)} MB / ${(report.memorySnapshot.totalJSHeapSize / (1024 * 1024)).toFixed(2)} MB</p>`;
            }

            window.detailsBox.innerHTML = detailsHtml; // Populate the details box

        } else {
            scoreBox.textContent = "Scan failed: Could not get results.";
            console.error("ExecuteScript results:", results);
        }

    } catch (error) {
        console.error("Error during scan:", error);
        scoreBox.textContent = `Scan failed: ${error.message}`;
        if (error.message.includes("Receiving end does not exist")) {
            scoreBox.textContent += " (Check page URL or ensure extension is loaded)";
        }
    } finally {
        btn.disabled = false;
    }
};


// --- IMPORTANT: runAdvancedQA must be defined globally or passed correctly ---
// For simplicity in this example, assuming it's defined in the same scope or globally.
async function runAdvancedQA() {
    const report = {
        forcedReflows: [],
        layoutThrashing: [],
        heavyFunctions: [],
        thirdPartyBlocking: {},
        longTasks: [],
        biggestNodes: [],
        LCP: { startTime: null, element: null, size: null, resourceType: null, resourceUrl: null, downloadTime: null },
        CLS: 0,
        memorySnapshot: { usedJSHeapSize: 0, totalJSHeapSize: 0, used: 'N/A' }
    };

    let score = 100;
    const issues = [];
    const cleanupFunctions = [];

    const addIssue = (description, pointsToDeduct = 5) => {
        issues.push(description);
        score -= pointsToDeduct;
        if (score < 0) score = 0;
    };

    const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
            if (entry.entryType === "largest-contentful-paint") {
                report.LCP.startTime = entry.startTime;
                report.LCP.element = entry.element;
                report.LCP.size = entry.size;
                report.LCP.resourceType = entry.element?.tagName;

                const resources = performance.getEntriesByType("resource");
                let lcpResource = null;
                if (entry.element && entry.element.src) {
                    lcpResource = resources.find(r => r.name === entry.element.src);
                } else if (entry.element && window.getComputedStyle(entry.element).backgroundImage) {
                    const bgImageUrl = window.getComputedStyle(entry.element).backgroundImage.slice(5, -2);
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
                const key = `${name} (${url})`;

                if (!report.thirdPartyBlocking[key]) {
                    report.thirdPartyBlocking[key] = { totalDuration: 0, count: 0 };
                }
                report.thirdPartyBlocking[key].totalDuration += entry.duration;
                report.thirdPartyBlocking[key].count++;
            }
        }
    });

    observer.observe({ type: "largest-contentful-paint", buffered: true });
    observer.observe({ type: "layout-shift", buffered: true });
    observer.observe({ type: "longtask", buffered: true });

    const originalGetters = {};
    const layoutReads = ["offsetWidth","offsetHeight","offsetTop","offsetLeft","scrollTop","scrollLeft","clientTop","clientLeft"];

    layoutReads.forEach(prop => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
        if (descriptor && descriptor.get) {
            originalGetters[prop] = descriptor.get;
            Object.defineProperty(HTMLElement.prototype, prop, {
                get() {
                    report.forcedReflows.push(prop);
                    return originalGetters[prop].call(this);
                },
                configurable: true
            });
            cleanupFunctions.push(() => {
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
        cleanupFunctions.push(() => {
            Element.prototype.getBoundingClientRect = origgetBoundingClientRect;
        });
    }

    let mutationCount = 0;
    let lastMutationTime = performance.now();
    const mutationBatch = [];
    const MAX_MUTATIONS_PER_BATCH = 5;
    const THROTTLING_TIME_MS = 50;

    const mo = new MutationObserver(mutations => {
        const now = performance.now();
        mutationCount += mutations.length;
        mutationBatch.push(...mutations);

        if (mutationBatch.length >= MAX_MUTATIONS_PER_BATCH || (now - lastMutationTime > THROTTLING_TIME_MS)) {
            if (mutationBatch.length > 5 && (now - lastMutationTime < THROTTLING_TIME_MS * 2)) {
                 report.layoutThrashing.push({ count: mutationBatch.length, timeWindow: now - lastMutationTime });
            }
            mutationBatch.length = 0;
            lastMutationTime = now;
        }
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    cleanupFunctions.push(() => mo.disconnect());

    performance.getEntriesByType("resource").forEach(res => {
        const isScript = res.initiatorType === 'script';
        const isStylesheet = res.initiatorType === 'link' && res.name.endsWith('.css');
        const isImage = res.initiatorType === 'img';
        const sizeThreshold = isScript ? 150 * 1024 : (isStylesheet ? 100 * 1024 : (isImage ? 200 * 1024 : 50 * 1024));
        const durationThreshold = 500;

        if (res.transferSize > sizeThreshold || res.duration > durationThreshold) {
            report.heavyFunctions.push({
                name: res.name,
                type: res.initiatorType,
                size: res.transferSize,
                duration: res.duration,
                isBlocking: isScript || isStylesheet
            });
            if (res.transferSize > sizeThreshold) addIssue(`Heavy resource: ${res.name} (${(res.transferSize / 1024).toFixed(1)} KB)`, 3);
            if (res.duration > durationThreshold) addIssue(`Slow resource: ${res.name} (${res.duration.toFixed(0)} ms)`, 3);
        }
    });

    const DOM_NODE_THRESHOLD = 1500;
    const DOM_DEPTH_THRESHOLD = 30;

    const body = document.body;
    if (body) {
        const nodeCount = body.getElementsByTagName('*').length;
        report.biggestNodes.push({ type: 'totalNodeCount', value: nodeCount });
        if (nodeCount > DOM_NODE_THRESHOLD) addIssue(`Excessive DOM nodes: ${nodeCount}`, 7);

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
    }

    if (window.performance && window.performance.memory) {
        const mem = window.performance.memory;
        report.memorySnapshot = {
            usedJSHeapSize: mem.usedJSHeapSize,
            totalJSHeapSize: mem.totalJSHeapSize,
            used: (mem.usedJSHeapSize / (1024 * 1024)).toFixed(2) + ' MB'
        };
        if (mem.usedJSHeapSize > 500 * 1024 * 1024) addIssue(`High JS Heap Size: ${(mem.usedJSHeapSize / (1024 * 1024)).toFixed(2)} MB`, 4);
    }

    const scrollPromise = new Promise(resolve => {
        const totalHeight = document.documentElement.scrollHeight;
        const scrollStep = totalHeight / 8;
        let currentScroll = 0;
        let scrollCount = 0;
        const maxScrolls = 8;

        const scrollInterval = setInterval(() => {
            currentScroll += scrollStep;
            window.scrollTo(0, Math.min(currentScroll, totalHeight));
            scrollCount++;

            if (scrollCount >= maxScrolls) {
                clearInterval(scrollInterval);
                window.scrollTo(0, 0);
                setTimeout(resolve, 500); // Short delay to ensure scroll settling
            }
        }, 200);
    });

    await scrollPromise;

    observer.disconnect();
    cleanupFunctions.forEach(cleanup => {
        try { cleanup(); } catch (e) { console.error("Cleanup error:", e); }
    });

    // Scoring adjustments based on metrics
    if (report.LCP.startTime !== null) {
        if (report.LCP.startTime > 4000) addIssue(`LCP time is high: ${(report.LCP.startTime).toFixed(2)}ms`, 10);
        else if (report.LCP.startTime > 2500) addIssue(`LCP time is high: ${(report.LCP.startTime).toFixed(2)}ms`, 5);

        if (report.LCP.downloadTime && report.LCP.downloadTime > 1500) addIssue(`LCP resource download time is high: ${(report.LCP.downloadTime).toFixed(0)}ms`, 5);
        if (report.LCP.resourceType === 'IMG' && report.LCP.size !== null && report.LCP.size > 500 * 1024) addIssue(`LCP image is very large: ${(report.LCP.size / 1024).toFixed(1)} KB`, 5);
    } else {
        addIssue("LCP not detected.", 5);
    }

    if (report.CLS > 0.1) addIssue(`Cumulative Layout Shift (CLS) is high: ${report.CLS.toFixed(4)}`, 10);
    else if (report.CLS > 0.05) addIssue(`CLS is moderately high: ${report.CLS.toFixed(4)}`, 3);

    if (report.longTasks.length > 3) addIssue(`Too many long tasks (${report.longTasks.length}) detected.`, 8);
    else if (report.longTasks.length > 1) addIssue(`Some long tasks detected (${report.longTasks.length}).`, 3);

    if (report.forcedReflows.length > 5) addIssue(`Frequent forced reflows (${report.forcedReflows.length} times).`, 5);
    if (report.layoutThrashing.length > 1) addIssue(`Layout thrashing detected (${report.layoutThrashing.length} instances).`, 8);

    const sortedBlocking = Object.entries(report.thirdPartyBlocking)
        .map(([key, value]) => ({ key, ...value }))
        .sort((a, b) => b.totalDuration - a.totalDuration);

    if (sortedBlocking.length > 0) {
        const blockingKey = sortedBlocking[0].key;
        const friendlyName = blockingKey.includes(' (') ? blockingKey.split(' (')[0] : blockingKey;
        const totalDuration = sortedBlocking[0].totalDuration;

        if (totalDuration > 500) addIssue(`Major blocking resource: ${friendlyName} (${totalDuration.toFixed(0)}ms)`, 10);
        else if (totalDuration > 200) addIssue(`Potential blocking resource: ${friendlyName} (${totalDuration.toFixed(0)}ms)`, 5);
    }

    const blockingResources = report.heavyFunctions.filter(r => r.isBlocking);
    if (blockingResources.length > 3) addIssue(`Multiple blocking resources detected.`, 5);
    if (report.heavyFunctions.length > 5) addIssue(`Multiple heavy resources detected.`, 3);

    // Final score adjustment based on aggregated issues
    if (issues.length === 0) {
         if (report.CLS > 0.05) score -= 2;
         if (report.LCP.startTime !== null && report.LCP.startTime > 2500) score -= 2;
         if (report.longTasks.length > 1) score -= 2;
    } else {
        // Deduct more if many issues exist but score is still high
        if (issues.length > 5 && score > 70) score = Math.max(50, score - issues.length * 2);
    }

    score = Math.max(0, Math.round(score));

    return { score, issues, report };
}

window.runAdvancedQA = runAdvancedQA; // Make it accessible globally for the content script
