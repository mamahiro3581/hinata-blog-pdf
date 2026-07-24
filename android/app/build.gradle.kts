import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use(::load)
    }
}

android {
    namespace = "com.mamahiro3581.sakamichiblogpdf"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.mamahiro3581.sakamichiblogpdf"
        minSdk = 23
        targetSdk = 36
        versionCode = 2
        versionName = "1.0.1"

        val testAdMobAppId = "ca-app-pub-3940256099942544~3347511713"
        val testBannerAdUnitId = "ca-app-pub-3940256099942544/6300978111"
        manifestPlaceholders["adMobAppId"] = testAdMobAppId
        buildConfigField("String", "ADMOB_BANNER_AD_UNIT_ID", "\"$testBannerAdUnitId\"")
        buildConfigField("String", "API_BASE_URL", "\"https://sakamichi-blog-pdf.sakamichi-apps.workers.dev\"")
    }

    val releaseSigning = if (keystorePropertiesFile.exists()) {
        signingConfigs.create("release") {
            storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
            storePassword = keystoreProperties.getProperty("storePassword")
            keyAlias = keystoreProperties.getProperty("keyAlias")
            keyPassword = keystoreProperties.getProperty("keyPassword")
        }
    } else {
        null
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            if (releaseSigning != null) {
                signingConfig = releaseSigning
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.06.01"))
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.core:core-ktx:1.18.0")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("com.google.android.gms:play-services-ads:25.4.0")
    implementation("com.google.android.ump:user-messaging-platform:4.0.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
