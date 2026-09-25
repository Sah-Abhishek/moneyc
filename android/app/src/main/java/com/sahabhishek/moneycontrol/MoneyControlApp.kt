package com.sahabhishek.moneycontrol

import android.app.Application
import android.content.Context

class MoneyControlApp : Application() {
  lateinit var graph: AppGraph
    private set

  override fun onCreate() {
    super.onCreate()
    graph = AppGraph(this)
  }
}

val Context.graph: AppGraph get() = (applicationContext as MoneyControlApp).graph
