package com.psdownload.app;

import android.Manifest;
import android.app.DownloadManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;

public class MainActivity extends AppCompatActivity {

    // 24/7 Cloud URL (Runs continuously without requiring PC to be on)
    public static final String APP_URL = "https://ps-download-bot-irhw.onrender.com/m";
    private static final int PERMISSION_REQUEST_CODE = 1001;

    private WebView webView;
    private ProgressBar progressBar;
    private long backPressedTime = 0;
    private String pendingDownloadUrl = null;
    private String pendingDownloadContentDisposition = null;
    private String pendingDownloadMimetype = null;
    private String customDownloadFolder = "PS_Download";
    private final java.util.concurrent.CopyOnWriteArrayList<Long> activeDownloadIds = new java.util.concurrent.CopyOnWriteArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);

        initWebView();
        checkAndRequestPermissions();

        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void initWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Hardware Acceleration
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        // Cookie Support
        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        }

        // WebChromeClient for Progress & Video Fullscreen
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }
        });

        // WebViewClient for In-App Navigation
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                // Stay inside the app for all internal and media routes
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false;
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
            }
        });

        // JavaScript Bridge for Storage Folder & In-App Coordination
        webView.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void setDownloadFolder(String path) {
                if (path != null && !path.trim().isEmpty()) {
                    String clean = path.trim().replace('\\', '/');
                    String[] parts = clean.split("/");
                    if (parts.length > 0) {
                        customDownloadFolder = parts[parts.length - 1];
                    }
                }
            }
        }, "AndroidBridge");

        // Native High-Speed Video & File Downloader Integration
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                startNativeDownload(url, contentDisposition, mimetype);
            }
        });
    }

    private void startNativeDownload(String url, String contentDisposition, String mimetype) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                pendingDownloadUrl = url;
                pendingDownloadContentDisposition = contentDisposition;
                pendingDownloadMimetype = mimetype;
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, PERMISSION_REQUEST_CODE);
                return;
            }
        }

        try {
            String filename = null;
            if (contentDisposition != null) {
                if (contentDisposition.contains("filename*=")) {
                    int starIdx = contentDisposition.indexOf("filename*=");
                    String part = contentDisposition.substring(starIdx + 10).trim();
                    int semi = part.indexOf(';');
                    if (semi != -1) part = part.substring(0, semi).trim();
                    if (part.toLowerCase().startsWith("utf-8''")) {
                        part = part.substring(7);
                    }
                    try {
                        filename = URLDecoder.decode(part.replace("\"", ""), "UTF-8");
                    } catch (Exception ignored) {}
                }
                if (filename == null || filename.isEmpty()) {
                    int idx = contentDisposition.indexOf("filename=");
                    if (idx != -1) {
                        String part = contentDisposition.substring(idx + 9).trim();
                        int semi = part.indexOf(';');
                        if (semi != -1) part = part.substring(0, semi).trim();
                        filename = part.replace("\"", "");
                        try {
                            filename = URLDecoder.decode(filename, "UTF-8");
                        } catch (Exception ignored) {}
                    }
                }
            }

            if (filename == null || filename.isEmpty()) {
                filename = URLUtil.guessFileName(url, contentDisposition, mimetype);
            }

            // Clean invalid file characters for Android filesystem
            filename = filename.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
            if (!filename.toLowerCase().endsWith(".mp4") && !filename.toLowerCase().endsWith(".mp3") && !filename.toLowerCase().endsWith(".jpg")) {
                filename = filename + ".mp4";
            }

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String finalMime = filename.endsWith(".mp3") ? "audio/mpeg" : (filename.endsWith(".jpg") ? "image/jpeg" : "video/mp4");
            request.setMimeType(mimetype != null ? mimetype : finalMime);
            request.addRequestHeader("User-Agent", webView.getSettings().getUserAgentString());

            // Cookies
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) {
                request.addRequestHeader("Cookie", cookies);
            }

            request.setTitle(filename);
            request.setDescription("កំពុងទាញយកវីដេអូ Full HD...");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                request.allowScanningByMediaScanner();
            }

            // Store directly in chosen subfolder inside standard Android Downloads
            String subDir = (customDownloadFolder != null && !customDownloadFolder.isEmpty()) ? customDownloadFolder : "PS_Download";
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, subDir + "/" + filename);

            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null) {
                long downloadId = dm.enqueue(request);
                activeDownloadIds.add(downloadId);
                Toast.makeText(this, "⚡ ចាប់ផ្តើមទាញយក: " + filename, Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Toast.makeText(this, "បរាជ័យក្នុងការទាញយក: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // When user clears (swipes away) the app from recent apps, immediately stop and cancel active downloads
        try {
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null && !activeDownloadIds.isEmpty()) {
                long[] ids = new long[activeDownloadIds.size()];
                for (int i = 0; i < activeDownloadIds.size(); i++) {
                    ids[i] = activeDownloadIds.get(i);
                }
                dm.remove(ids);
                activeDownloadIds.clear();
            }
        } catch (Exception ignored) {}
    }

    private void checkAndRequestPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, PERMISSION_REQUEST_CODE);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (pendingDownloadUrl != null) {
                    startNativeDownload(pendingDownloadUrl, pendingDownloadContentDisposition, pendingDownloadMimetype);
                    pendingDownloadUrl = null;
                }
            } else {
                Toast.makeText(this, "ត្រូវការសិទ្ធិផ្ទុកទិន្នន័យ (Storage) ដើម្បីទាញយកវីដេអូ", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            if (System.currentTimeMillis() - backPressedTime < 2000) {
                super.onBackPressed();
            } else {
                backPressedTime = System.currentTimeMillis();
                Toast.makeText(this, "ចុចថយក្រោយម្តងទៀតដើម្បីចាកចេញ", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }
}
