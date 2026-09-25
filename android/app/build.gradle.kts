import java.util.Properties

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
}

// Per-machine settings live in local.properties (never committed):
//   moneycontrol.apiBaseUrl=https://moneyc.vercel.app/api/v1/
//   moneycontrol.googleWebClientId=<the WEB client id — the server's GOOGLE_CLIENT_ID>
// The web client id is not a secret; the app asks Google for a code *for* it,
// which only the server (holding the client secret) can redeem.
val local = Properties().apply {
  rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
fun setting(key: String, default: String = ""): String =
  (local.getProperty(key) ?: providers.gradleProperty(key).orNull ?: default).trim()

android {
  namespace = "com.sahabhishek.moneycontrol"
  // Current AndroidX needs compileSdk 37; targetSdk (runtime behaviour) stays at 36.
  compileSdk = 37
  defaultConfig {
    applicationId = "com.sahabhishek.moneycontrol"
    minSdk = 26
    targetSdk = 36
    versionCode = 1
    versionName = "0.1.0"

    val apiBaseUrl = setting("moneycontrol.apiBaseUrl", "https://moneyc.vercel.app/api/v1/")
    require(apiBaseUrl.endsWith("/")) { "moneycontrol.apiBaseUrl must end with a slash" }
    buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
    buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"${setting("moneycontrol.googleWebClientId")}\"")
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }

  buildTypes {
    release {
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  buildFeatures {
    compose = true
    aidl = false
    buildConfig = true
    shaders = false
  }
  packaging {
    resources {
      excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
  }
  testOptions {
    unitTests.isReturnDefaultValues = true
  }
}

kotlin {
  jvmToolchain(17)
}

dependencies {
  val composeBom = platform(libs.androidx.compose.bom)
  implementation(composeBom)
  androidTestImplementation(composeBom)

  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.core.splashscreen)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.activity.compose)
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.viewmodel.compose)
  implementation(libs.androidx.datastore.preferences)

  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  debugImplementation(libs.androidx.compose.ui.tooling)

  implementation(libs.androidx.navigation3.ui)
  implementation(libs.androidx.navigation3.runtime)
  implementation(libs.androidx.lifecycle.viewmodel.navigation3)

  // Network + JSON
  implementation(libs.okhttp)
  implementation(libs.kotlinx.serialization.json)
  implementation(libs.kotlinx.coroutines.android)

  // Google sign-in (authorization with an offline server auth code)
  implementation(libs.play.services.auth)
  implementation(libs.kotlinx.coroutines.play.services)

  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)

  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  debugImplementation(libs.androidx.compose.ui.test.manifest)
  androidTestImplementation(libs.androidx.test.core)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.runner)
  androidTestImplementation(libs.androidx.test.espresso.core)
}
