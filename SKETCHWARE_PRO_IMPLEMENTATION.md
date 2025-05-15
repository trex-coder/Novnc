# Sketchware Pro Implementation Guide for GitHub Loader

## Overview

This guide explains how to implement the standalone GitHub Loader HTML file in your Sketchware Pro project. The HTML file is self-contained with all necessary CSS styles inline, making it easy to use directly in a WebView without requiring additional files.

## Files Included

- `Github_loader_standalone.html`: A single, self-contained HTML file with all styles embedded

## Implementation Steps

### 1. Copy the HTML File to Your Project

1. Copy the `Github_loader_standalone.html` file to your Sketchware Pro project's assets folder
2. Rename it to `Github_loader.html` (or keep the original name and adjust the code accordingly)

### 2. Add WebView to Your Layout

1. In Sketchware Pro, open your project
2. Go to the View section
3. Add a WebView component to your layout
4. Set the WebView ID to `webview1` (or any name you prefer)

### 3. Add Required Variables

In your activity, add these variables:

```java
String patToken = ""; // Your GitHub Personal Access Token
String githubUserId = ""; // Your GitHub User ID
```

### 4. WebView Implementation Code

Add this code to your activity's onCreate method:

```java
// Initialize WebView
WebView webview1 = findViewById(R.id.webview1);

// Enable JavaScript
WebSettings webSettings = webview1.getSettings();
webSettings.setJavaScriptEnabled(true);

// Create URL with parameters (recommended approach for Sketchware Pro)
try {
    String url = "file:///android_asset/Github_loader.html" + 
                 "?pat_token=" + URLEncoder.encode(patToken, "UTF-8") + 
                 "&github_userid=" + URLEncoder.encode(githubUserId, "UTF-8");
    webview1.loadUrl(url);
} catch (Exception e) {
    // Handle encoding error
    webview1.loadUrl("file:///android_asset/Github_loader.html");
}
```

### 5. Required Import

Add this import at the top of your activity:

```java
import java.net.URLEncoder;
```

### 6. Add Required Permissions

Add these permissions to your AndroidManifest.xml:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

## Customizing the HTML File

The standalone HTML file is designed to be easily customizable:

1. **Modify the UI**: You can edit the CSS styles directly in the HTML file to change colors, fonts, and layout
2. **Add Functionality**: The JavaScript section can be extended to add more features or API calls
3. **Change Parameters**: You can modify the parameter names in both the HTML and Java code if needed

## How It Works

1. The WebView loads the HTML file from the assets folder
2. The URL parameters (`pat_token` and `github_userid`) are passed to the HTML file
3. JavaScript in the HTML file extracts these parameters and displays them
4. The loading animation simulates a connection process

## Troubleshooting

1. If the WebView doesn't load, check that the file path is correct and that the HTML file is properly placed in the assets folder
2. Ensure JavaScript is enabled in the WebView settings
3. If parameters aren't being passed correctly, verify the URL encoding in the Java code
4. Check LogCat for any JavaScript errors or encoding exceptions

## Next Steps

Once the GitHub credentials are successfully displayed in the WebView, you can extend the functionality to:

1. Make API calls to GitHub using the PAT token
2. Display repository information
3. Implement specific GitHub operations based on your requirements