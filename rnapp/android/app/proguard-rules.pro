# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# FastImage / Glide keep rules to avoid stripping models and generated classes
-keep class com.dylanvann.fastimage.** { *; }
-keep class com.bumptech.glide.** { *; }
-dontwarn com.bumptech.glide.**
-keep class * extends com.bumptech.glide.module.AppGlideModule
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep public enum com.bumptech.glide.load.ImageHeaderParser$** { *; }
