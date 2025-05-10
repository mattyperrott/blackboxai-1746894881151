package io.epher.chat.node

import android.content.Context
import android.net.LocalSocket
import android.net.LocalSocketAddress
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.io.BufferedWriter
import java.io.OutputStreamWriter

package io.epher.chat.node

import android.content.Context
import android.net.LocalSocket
import android.net.LocalSocketAddress
import android.webkit.JavascriptInterface
import android.webkit.WebView
import io.epher.chat.ygg.YggVpnService
import java.io.BufferedWriter
import java.io.OutputStreamWriter
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class NodeJSBridge(private val ctx: Context, private val web: WebView) {
    private var writer: BufferedWriter? = null
    private var isConnected = AtomicBoolean(false)
    private var useYggdrasil = AtomicBoolean(false)
    private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private var reconnectJob: java.util.concurrent.Future<*>? = null

    // Certificate pinning: expected certificate SHA-256 hash (example placeholder)
    private val expectedCertHash = "ABCD1234EF567890ABCD1234EF567890ABCD1234EF567890ABCD1234EF567890"

    init {
        try {
            NodeJS.start(ctx)
            verifyWebViewCertificate()
            connectSocket()
        } catch (e: Exception) {
            notifyError("Failed to initialize Node.js: ${e.message}")
        }
    }

    private fun verifyWebViewCertificate() {
        // Example placeholder for certificate pinning logic
        // In real implementation, retrieve the WebView's SSL certificate and compare its SHA-256 hash
        // Since WebView loads local content, this is a placeholder for future HTTPS content verification
        val actualCertHash = getWebViewCertificateHash()
        if (actualCertHash != expectedCertHash) {
            notifyError("WebView certificate verification failed")
            throw SecurityException("Certificate pinning failure")
        }
    }

    private fun getWebViewCertificateHash(): String {
        // Placeholder method: in real app, implement retrieval of certificate hash
        // For local files, this may not apply; for remote content, implement SSL pinning here
        return expectedCertHash // Assume match for now
    }

    private fun connectSocket() {
        try {
            updateConnectionStatus("connecting")
            val sock = LocalSocket()
            sock.connect(LocalSocketAddress("epher.sock", LocalSocketAddress.Namespace.FILESYSTEM))
            
            writer = BufferedWriter(OutputStreamWriter(sock.outputStream))
            
            // Start reading from socket in a separate thread
            Thread {
                try {
                    val reader = sock.inputStream.bufferedReader()
                    val buffer = StringBuilder()
                    val charArray = CharArray(1024)
                    var numRead: Int
                    while (true) {
                        numRead = reader.read(charArray)
                        if (numRead == -1) break
                        buffer.append(charArray, 0, numRead)
                        // Process complete lines
                        var lineEndIndex = buffer.indexOf("\n")
                        while (lineEndIndex != -1) {
                            val line = buffer.substring(0, lineEndIndex).trim()
                            if (line.isNotEmpty()) {
                                try {
                                    handleIncomingMessage(line)
                                } catch (e: Exception) {
                                    notifyError("Malformed message received: ${e.message}")
                                }
                            }
                            buffer.delete(0, lineEndIndex + 1)
                            lineEndIndex = buffer.indexOf("\n")
                        }
                    }
                    // Socket closed gracefully
                    handleDisconnect("Socket closed")
                } catch (e: Exception) {
                    handleDisconnect("Socket read error: ${e.message}")
                }
            }.start()

        } catch (e: Exception) {
            handleDisconnect("Socket connection failed: ${e.message}")
        }
    }

    private fun handleIncomingMessage(line: String) {
        try {
            val json = JSONObject(line)
            when (json.optString("type")) {
                "connected" -> {
                    isConnected.set(true)
                    updateConnectionStatus("connected")
                }
                "message" -> {
                    web.post { 
                        web.evaluateJavascript(
                            "window._onBackendMessage(${json.getJSONObject("data")})",
                            null
                        )
                    }
                }
                "delivered" -> {
                    val messageId = json.optString("messageId", "")
                    val status = json.optString("status", "failed")
                    pendingMessages.remove(messageId)?.invoke(status)
                }
                "error" -> notifyError(json.getString("error"))
                else -> web.post { 
                    web.evaluateJavascript("window._onBackendMessage($line)", null)
                }
            }
        } catch (e: Exception) {
            notifyError("Failed to process message: ${e.message}")
        }
    }

    @JavascriptInterface
    fun join(room: String, preKeyBundle: String) {
        try {
            val command = JSONObject().apply {
                put("cmd", "join")
                put("room", room)
                put("preKeyBundle", JSONObject(preKeyBundle))
                put("transport", if (useYggdrasil.get()) "yggdrasil" else "direct")
            }
            send(command.toString())
        } catch (e: Exception) {
            notifyError("Failed to join room: ${e.message}")
        }
    }

    private val pendingMessages = mutableMapOf<String, (String) -> Unit>()

    @JavascriptInterface
    fun sendMessage(payload: String) {
        try {
            if (!isConnected.get()) {
                notifyError("Not connected to chat network")
                return
            }
            val jsonObj = JSONObject(payload)
            val messageId = jsonObj.optString("messageId", "")
            if (messageId.isNotEmpty()) {
                pendingMessages[messageId] = { status ->
                    web.post {
                        web.evaluateJavascript("window._onMessageDelivery('$messageId', '$status')", null)
                    }
                }
            }
            val command = JSONObject().apply {
                put("cmd", "send")
                put("data", jsonObj)
            }
            send(command.toString())
        } catch (e: Exception) {
            notifyError("Failed to send message: ${e.message}")
        }
    }

    @JavascriptInterface
    fun setTransport(useYgg: Boolean) {
        try {
            if (useYgg == useYggdrasil.get()) return
            
            useYggdrasil.set(useYgg)
            if (useYgg) {
                if (!YggVpnService.isVpnActive(ctx)) {
                    YggVpnService.start(ctx)
                }
            } else {
                YggVpnService.stop(ctx)
            }
            
            // Reconnect with new transport
            handleDisconnect("Switching transport mode")
        } catch (e: Exception) {
            notifyError("Failed to switch transport: ${e.message}")
        }
    }

    private fun send(json: String) {
        writer?.apply {
            try {
                write(json)
                newLine()
                flush()
            } catch (e: Exception) {
                handleDisconnect("Failed to send data: ${e.message}")
                throw e
            }
        } ?: throw IllegalStateException("Socket not connected")
    }

    private var reconnectAttempts = 0
    private val maxReconnectAttempts = 5

    private fun handleDisconnect(error: String) {
        if (isConnected.get()) {
            isConnected.set(false)
            writer = null
            notifyError("$error. Attempting to reconnect... (${reconnectAttempts + 1}/$maxReconnectAttempts)")
            updateConnectionStatus("disconnected")
            
            // Schedule reconnection attempt with exponential backoff
            reconnectJob?.cancel(false)
            if (reconnectAttempts < maxReconnectAttempts) {
                val delay = (Math.pow(2.0, reconnectAttempts.toDouble()) * 1000).toLong()
                reconnectJob = scheduler.schedule({
                    reconnectAttempts++
                    connectSocket()
                }, delay, TimeUnit.MILLISECONDS)
            } else {
                notifyError("Maximum reconnection attempts reached. Please check your network or restart the app.")
            }
        }
    }

    private fun resetReconnectAttempts() {
        reconnectAttempts = 0
    }

    private fun notifyError(error: String) {
        web.post {
            web.evaluateJavascript(
                "window._onBackendError('${error.replace("'", "\\'")}')",
                null
            )
            android.util.Log.e("NodeJSBridge", "Error notified to UI: $error")
        }
    }

    private fun updateConnectionStatus(status: String) {
        web.post {
            web.evaluateJavascript(
                "window._onConnectionStatus('$status')",
                null
            )
        }
    }

    fun cleanup() {
        try {
            scheduler.shutdown()
            reconnectJob?.cancel(true)
            writer?.close()
            writer = null
            isConnected.set(false)
            if (useYggdrasil.get()) {
                YggVpnService.stop(ctx)
            }
        } catch (e: Exception) {
            notifyError("Cleanup error: ${e.message}")
        }
    }
}