# QA Inspector 🧐

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/YourUsername/QA-Inspector)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Chrome Extension designed for automated web quality assurance, focusing on identifying performance bottlenecks and potential security vulnerabilities. QA Inspector provides a summarized health score and detailed, interactive reports to help developers and QA engineers streamline their testing process.

## ✨ Features

*   **Automated Page Scanning:** Quickly scans the current web page for common performance and security issues.
*   **Comprehensive Health Score:** Assigns a score out of 100 to indicate the overall quality and health of the page.
*   **Summarized Issue Reporting:** Presents detected issues in a clear, concise summary to avoid information overload.
*   **Interactive Details:** Allows users to expand and collapse detailed information for each identified issue, providing context and specific data.
*   **URL Shortening:** A utility function to display long URLs in a more manageable format within the report.
*   **Focus Areas:** Primarily targets Core Web Vitals, resource loading issues, and basic security checks (like CSP, third-party scripts).
*   **Developer-Friendly:** Built with Vanilla JavaScript for simplicity and ease of understanding.

## 🚀 Getting Started

### Installation

1.  **Clone the repository:**
```bash
git clone https://github.com/erfan-akbarimanesh/QA-Inspector.git
cd QA-Inspector
```

2. **Load the extension in Chrome:**

A: Open Google Chrome and navigate to chrome://extensions/.
B: Enable Developer mode by toggling the switch in the top-right corner.
C: Click the “Load unpacked” button.
D: Select the QA-Inspector directory (the root folder containing manifest.json and other source files).

The QA Inspector extension icon should now appear in your Chrome toolbar.


## 📖 Usage

1.  Navigate to the web page you wish to inspect.
2.  Click on the **QA Inspector** icon in your Chrome toolbar.
3.  Click the **"Scan Page"** button in the extension's popup.
4.  Review the **Page health score** and the list of **Issues**.
5.  Use the interactive sections to expand and view **Detailed Report** findings.

## 🖼️ Screenshots

*(Add screenshots of your extension in action here. Recommended: a screenshot of the popup before scanning, during scanning, and after scanning with details expanded.)*

*   **Initial Popup:**
    *(Placeholder for the screenshot showing the extension popup before scanning.)*

*   **Scanning in Progress:**
    *(Placeholder for the screenshot showing the scanning process.)*

*   **Report View (Collapsed):**
    *(Placeholder for the screenshot showing the summarized report view.)*

*   **Report View (Expanded Details):**
    *(Placeholder for the screenshot showing detailed report sections expanded.)*

*(Remember to replace these placeholders with actual image file paths or URLs, preferably hosted within your repository.)*

## 🛠️ Technology Stack

*   **JavaScript (Vanilla):** Core logic and UI manipulation.
*   **HTML:** Structure of the popup interface.
*   **CSS:** Styling for the popup interface.
*   **Chrome Extension APIs:** `chrome.tabs`, `chrome.scripting`.

## 🤝 Contributing

Contributions are welcome! If you have suggestions for improvements or find bugs, please:

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix (`git checkout -b feature/YourNewFeature` or `git checkout -b bugfix/YourBugFix`).
3.  Make your changes and commit them (`git commit -m 'Add some feature/fix bug'`).
4.  Push to the branch (`git push origin feature/YourNewFeature`).
5.  Open a Pull Request.
