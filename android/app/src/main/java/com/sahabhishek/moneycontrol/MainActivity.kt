package com.sahabhishek.moneycontrol

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahabhishek.moneycontrol.ui.shell.Toaster
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.MoneyControlTheme

class MainActivity : ComponentActivity() {
  private val gateVm: GateViewModel by viewModels { viewModelFactory { initializer { GateViewModel(graph) } } }

  override fun onCreate(savedInstanceState: Bundle?) {
    // Keep the splash up until we know whether someone is signed in — no flash of the sign-in page.
    installSplashScreen().setKeepOnScreenCondition { gateVm.gate.value == Gate.Unknown }
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent {
      MoneyControlTheme {
        Box(Modifier.fillMaxSize().background(Ledger.colors.paperBase)) {
          MoneyControlRoot(graph, gateVm)
          Toaster(graph.messages)
        }
      }
    }
  }
}
