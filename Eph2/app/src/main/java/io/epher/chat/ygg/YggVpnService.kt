package io.epher.chat.ygg

import android.content.Intent
import android.net.VpnService
import java.io.File
import android.widget.Toast
import io.epher.chat.util.VpnUtils

class YggVpnService : VpnService() {
    private var proc: Process? = null

    override fun onStartCommand(i: Intent?, f: Int, id: Int): Int {
        if (proc != null) return START_STICKY

        // Check for existing VPN conflicts
        if (VpnUtils.isAnotherVpnActive(this)) {
            Toast.makeText(this, "Another VPN is active. Please disable it before starting Yggdrasil.", Toast.LENGTH_LONG).show()
            stopSelf()
            return START_NOT_STICKY
        }

        val iface = Builder()
            .addAddress("200::1", 7)
            .addRoute("::", 0)
            .setSession("Epher-Ygg")
            .establish() ?: return START_NOT_STICKY

        try {
            val yggBin = File(filesDir, "ygg.android").apply {
                if (!exists()) {
                    assets.open("bin/ygg.android").copyTo(outputStream())
                    setExecutable(true, false)
                }
            }

            proc = ProcessBuilder(
                yggBin.absolutePath,
                "-tunfd", iface.fileDescriptor.fd.toString(),
                "-socks", "9001",
                "-subnet", "200::/7"
            ).redirectErrorStream(true).start()
        } catch (e: Exception) {
            Toast.makeText(this, "Failed to start Yggdrasil VPN: ${e.message}", Toast.LENGTH_LONG).show()
            stopSelf()
            return START_NOT_STICKY
        }

        return START_STICKY
    }

    override fun onDestroy() {
        proc?.destroy()
        proc = null
        super.onDestroy()
    }
}
