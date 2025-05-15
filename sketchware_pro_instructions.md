# Sketchware Pro WebView Implementation Guide

## Overview
This guide explains how to implement a WebView in Sketchware Pro that loads the `Github_loader.html` file and passes GitHub PAT token and user ID values to it.

## Steps to Implement

### 1. Add WebView to Your Layout

1. In Sketchware Pro, open your project
2. Go to the View section
3. Add a WebView component to your layout
4. Set the WebView ID to `webview1` (or any name you prefer)

### 2. Add Required Variables

In your activity, add these variables:

```java
String patToken = ""; // Your GitHub Personal Access Token
String githubUserId = ""; // Your GitHub User ID
```

### 3. WebView Implementation Code

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

### 4. Required Import

Add this import at the top of your activity:

```java
import java.net.URLEncoder;
```

### 5. Add HTML File to Assets

1. Create an `assets` folder in your Sketchware Pro project if it doesn't exist
2. Copy the `Github_loader_sketchware.html` file to the assets folder (rename it to `Github_loader.html`)
   - This version is specifically optimized for Sketchware Pro and uses URL parameters instead of JavaScript interface
3. Make sure to also copy the required CSS files and folders from the noVNC project:
   - Copy the `app` folder with its subfolders to your assets

### 6. Add Required Permissions

Add these permissions to your AndroidManifest.xml:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### 7. Testing

To test without actual values, you can set default values:

```java
patToken = "your_test_pat_token";
githubUserId = "your_test_github_userid";
```

### Note on JavaScript Interface Method

The JavaScript interface method is not recommended for Sketchware Pro as it requires implementing an internal class which can be difficult in the Sketchware environment. The URL parameters approach shown above is the preferred method.

If you're using a different Android development environment that supports inner classes more easily, you could alternatively use this approach:

```java
// Add JavaScript interface to pass values to HTML
webview1.addJavascriptInterface(new WebAppInterface(), "Android");

// Load the HTML file without parameters
webview1.loadUrl("file:///android_asset/Github_loader.html");

// Define the interface class
public class WebAppInterface {
    @JavascriptInterface
    public String getPatToken() {
        return patToken;
    }
    
    @JavascriptInterface
    public String getGithubUserId() {
        return githubUserId;
    }
}
```

## Troubleshooting

1. If the WebView doesn't load, check that the file paths are correct and that the HTML file is properly placed in the assets folder
2. Ensure JavaScript is enabled in the WebView settings
3. Verify that all required CSS and asset files are included in your assets folder
4. Check that URL encoding is working properly - if special characters in your tokens cause issues, try testing with simpler values first
5. Use LogCat to check for any JavaScript errors or encoding exceptions
6. If the parameters aren't being passed correctly, verify the HTML file is properly parsing URL parameters with the `getParameterByName` function

## Next Steps

Once the GitHub credentials are successfully displayed in the WebView, you can extend the functionality to:

1. Make API calls to GitHub using the PAT token
2. Display repository information
3. Implement specific GitHub operations based on your requirements