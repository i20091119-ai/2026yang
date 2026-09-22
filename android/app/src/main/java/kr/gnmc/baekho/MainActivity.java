package kr.gnmc.baekho;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import java.net.HttpURLConnection;
import java.net.URL;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * 백호장군 안이명: 안드로이드용 껍데기 앱.
 * 인터넷이 되면 GitHub Pages 의 최신 버전을 띄우고(자동 업데이트), 안 되면 앱에 담긴 사본을 띄운다.
 */
public class MainActivity extends Activity {
    private static final String LIVE_URL = "https://i20091119-ai.github.io/2026yang/";
    private static final String LIVE_HOST = "i20091119-ai.github.io";
    private static final String LOCAL_URL = "file:///android_asset/www/index.html";

    private WebView web;
    private boolean fellBack = false;
    private long lastLiveLoad = 0;
    private static final long RELOAD_AFTER_MS = 5 * 60 * 1000; // 5분 넘게 뒀다 돌아오면 새로 받는다

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setAllowFileAccess(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT); // 평소엔 캐시를 써서 가볍게
        web.setBackgroundColor(0xFF120E12);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                String scheme = uri.getScheme();
                if ("file".equals(scheme) || (host != null && host.equalsIgnoreCase(LIVE_HOST))) return false;
                // 로고 링크 등 외부 주소는 브라우저로
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) loadLocal();
            }
        });

        setContentView(web);
        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else if (isOnline()) {
            loadLive();
        } else {
            loadLocal();
        }
    }

    /**
     * 가벼운 업데이트 확인: 서버에 HEAD 요청 하나만 보내 index.html 의 ETag 를 본다.
     * 지난번과 다르면(=새로 푸시됨) 캐시를 비우고 받고, 같으면 캐시를 그대로 써서 빠르고 가볍게 연다.
     */
    private void loadLive() {
        fellBack = false;
        lastLiveLoad = System.currentTimeMillis();
        final SharedPreferences prefs = getSharedPreferences("baekho", MODE_PRIVATE);
        final Handler ui = new Handler(Looper.getMainLooper());
        new Thread(() -> {
            String tag = null;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(LIVE_URL).openConnection();
                c.setRequestMethod("HEAD");
                c.setRequestProperty("Cache-Control", "no-cache");
                c.setConnectTimeout(3000);
                c.setReadTimeout(3000);
                if (c.getResponseCode() == 200) {
                    tag = c.getHeaderField("ETag");
                    if (tag == null) tag = c.getHeaderField("Last-Modified");
                }
                c.disconnect();
            } catch (Exception ignored) { }
            final String newTag = tag;
            ui.post(() -> {
                if (newTag != null && !newTag.equals(prefs.getString("etag", ""))) {
                    web.clearCache(true);
                    prefs.edit().putString("etag", newTag).apply();
                }
                web.loadUrl(LIVE_URL);
            });
        }).start();
    }

    private void loadLocal() {
        if (fellBack) return;
        fellBack = true;
        web.loadUrl(LOCAL_URL);
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        // 한참 뒤에 다시 열면 최신 버전으로 새로 받는다 (게임 도중에는 방해하지 않도록 5분 기준)
        if (lastLiveLoad > 0 && System.currentTimeMillis() - lastLiveLoad > RELOAD_AFTER_MS && isOnline()) loadLive();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
