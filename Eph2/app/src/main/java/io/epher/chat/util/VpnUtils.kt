package io.epher.chat.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

fun isVpnActive(ctx: Context): Boolean {
    val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val net = cm.activeNetwork ?: return false
    val nc = cm.getNetworkCapabilities(net) ?: return false
    return nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
}