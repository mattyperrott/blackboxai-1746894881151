package io.epher.chat.ui

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import io.epher.chat.util.isVpnActive
import android.content.Intent
import io.epher.chat.ygg.YggVpnService

@Composable
fun TransportSheet() {
    val ctx = LocalContext.current
    val vpnBusy = remember { isVpnActive(ctx) }
    var yggOn by remember { mutableStateOf(false) }

    Column(Modifier.padding(24.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Check, null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(8.dp))
            Text("Direct Hyperswarm (default)")
        }
        Spacer(Modifier.height(16.dp))

        val disabled = vpnBusy && !yggOn
        Row(verticalAlignment = Alignment.CenterVertically) {
            Switch(
                checked = yggOn,
                enabled = !disabled,
                onCheckedChange = {
                    yggOn = it
                    val svc = Intent(ctx, YggVpnService::class.java)
                    if (it) ctx.startService(svc) else ctx.stopService(svc)
                }
            )
            Spacer(Modifier.width(8.dp))
            Column {
                Text(
                    "Use Yggdrasil overlay",
                    color = if (disabled) MaterialTheme.colorScheme.onSurfaceVariant
                    else MaterialTheme.colorScheme.onSurface
                )
                if (disabled) Text(
                    "Another VPN is active. Disable it first.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }
        }
    }
}