package com.openwrtmanager;

import com.facebook.react.modules.network.OkHttpClientFactory;
import com.facebook.react.modules.network.ReactCookieJarContainer;

import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import okhttp3.OkHttpClient;

/**
 * 自定义 OkHttpClient 工厂，信任所有 SSL 证书（包括自签名）
 * 用于路由器管理 APP，路由器通常使用自签名证书
 */
public class UnsafeOkHttpClientFactory implements OkHttpClientFactory {

    @Override
    public OkHttpClient createNewNetworkModuleClient() {
        try {
            // 信任所有证书的 TrustManager
            final X509TrustManager trustAllCerts = new X509TrustManager() {
                @Override
                public void checkClientTrusted(X509Certificate[] chain, String authType)
                    throws CertificateException {}

                @Override
                public void checkServerTrusted(X509Certificate[] chain, String authType)
                    throws CertificateException {}

                @Override
                public X509Certificate[] getAcceptedIssuers() {
                    return new X509Certificate[0];
                }
            };

            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(null, new TrustManager[]{trustAllCerts}, new java.security.SecureRandom());

            return new OkHttpClient.Builder()
                .cookieJar(new ReactCookieJarContainer())
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .writeTimeout(15, TimeUnit.SECONDS)
                .sslSocketFactory(sslContext.getSocketFactory(), trustAllCerts)
                .hostnameVerifier((hostname, session) -> true) // 信任所有主机名
                .build();

        } catch (Exception e) {
            // 出错时返回默认客户端
            return new OkHttpClient.Builder()
                .cookieJar(new ReactCookieJarContainer())
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .build();
        }
    }
}
