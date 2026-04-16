# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# App
-keep class com.openwrtmanager.** { *; }

# Keep annotations
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable

# OkHttp（React Native 网络层）
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# 自定义 SSL 工厂
-keep class com.openwrtmanager.UnsafeOkHttpClientFactory { *; }
