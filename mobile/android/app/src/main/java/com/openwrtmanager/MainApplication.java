package com.openwrtmanager;

import android.app.Application;
import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactNativeHost;
import com.facebook.react.modules.network.OkHttpClientProvider;
import com.facebook.soloader.SoLoader;
import java.lang.reflect.Field;
import java.util.List;

public class MainApplication extends Application implements ReactApplication {

    private final ReactNativeHost mReactNativeHost =
        new DefaultReactNativeHost(this) {
            @Override
            public boolean getUseDeveloperSupport() {
                return BuildConfig.DEBUG;
            }

            @Override
            protected List<ReactPackage> getPackages() {
                return new PackageList(this).getPackages();
            }

            @Override
            protected String getJSMainModuleName() {
                return "index";
            }

            @Override
            protected boolean isNewArchEnabled() {
                return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
            }

            @Override
            protected Boolean isHermesEnabled() {
                return BuildConfig.IS_HERMES_ENABLED;
            }
        };

    @Override
    public ReactNativeHost getReactNativeHost() {
        return mReactNativeHost;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        SoLoader.init(this, false);

        // 必须在 SoLoader.init 之后、React Native 初始化之前设置
        // 先清空已有的单例客户端（如果有），确保新 factory 生效
        try {
            Field sClientField = OkHttpClientProvider.class.getDeclaredField("sClient");
            sClientField.setAccessible(true);
            sClientField.set(null, null);
        } catch (Exception ignored) {}

        // 注册信任所有 SSL 证书的 OkHttp 工厂
        OkHttpClientProvider.setOkHttpClientFactory(new UnsafeOkHttpClientFactory());

        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            DefaultNewArchitectureEntryPoint.load();
        }
    }
}
