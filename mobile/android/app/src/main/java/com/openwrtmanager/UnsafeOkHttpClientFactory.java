package com.openwrtmanager;

import com.facebook.react.modules.network.OkHttpClientFactory;
import com.facebook.react.modules.network.ReactCookieJarContainer;

import java.security.cert.X509Certificate;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import okhttp3.OkHttpClient;

/**
 * 信任所有 SSL 证书的 OkHttp 工厂
 * OpenWrt 路由器通常使用自签名证书，需要跳过验证
 */
public class UnsafeOkHttpClientFactory implements OkHttpClientFactory {

    @Override
    public OkHttpClient createNewNetworkModuleClient() {
        try {
            X509TrustManager trustAll = new X509TrustManager() {
                public void checkClientTrusted(X509Certificate[] c, String a) {}
                public void checkServerTrusted(X509Certificate[] c, String a) {}
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            };

            SSLContext sc = SSLContext.getInstance("TLS");
            sc.init(null, new TrustManager[]{trustAll}, null);

            return new OkHttpClient.Builder()
                .cookieJar(new ReactCookieJarContainer())
                .sslSocketFactory(sc.getSocketFactory(), trustAll)
                .hostnameVerifier((h, s) -> true)
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .build();

        } catch (Exception e) {
            return new OkHttpClient.Builder()
                .cookieJar(new ReactCookieJarContainer())
                .build();
        }
    }
}
