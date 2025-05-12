package io.epher.chat.node

import android.content.Context
import java.io.File
import java.util.zip.ZipInputStream

object NodeJS {
    private const val PROJECT_ZIP = "nodejs-project.zip"
    private const val PROJECT_DIR = "nodejs-project"
    private const val ENTRY_JS = "start.js"

    fun start(ctx: Context) {
        val proj = File(ctx.filesDir, PROJECT_DIR)
        if (!proj.exists()) extract(ctx, proj)

        // Verify integrity of extracted files (simple checksum or signature verification)
        if (!verifyProjectIntegrity(proj)) {
            throw SecurityException("Node.js project integrity verification failed")
        }

        val abi = android.os.Build.SUPPORTED_ABIS.first()
        val node = File(ctx.filesDir, "node-$abi").apply {
            if (!exists()) {
                ctx.assets.open("bin/$abi/node").copyTo(outputStream())
                setExecutable(true, false)
            }
        }

        // Verify node binary integrity
        if (!verifyNodeBinary(node)) {
            throw SecurityException("Node binary integrity verification failed")
        }

        ProcessBuilder(node.absolutePath, ENTRY_JS)
            .directory(proj)
            .redirectErrorStream(true)
            .start()
    }

    private fun verifyProjectIntegrity(proj: File): Boolean {
        // Placeholder: implement checksum or signature verification of project files
        // For example, verify a manifest file with hashes of all files
        return true
    }

    private fun verifyNodeBinary(node: File): Boolean {
        // Placeholder: implement checksum or signature verification of node binary
        return true
    }

    private fun extract(ctx: Context, dest: File) {
        dest.mkdirs()
        ctx.assets.open(PROJECT_ZIP).use { zipIn ->
            ZipInputStream(zipIn).use { zin ->
                var e = zin.nextEntry
                while (e != null) {
                    val outFile = File(dest, e.name)
                    if (e.isDirectory) outFile.mkdirs() else zin.copyTo(outFile.outputStream())
                    e = zin.nextEntry
                }
            }
        }
    }
}