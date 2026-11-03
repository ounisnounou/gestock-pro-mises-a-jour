package dz.gestock.mobile;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/** Mise à jour de l'application depuis l'application : téléchargement vérifié (SHA-256) puis installateur Android. */
@CapacitorPlugin(name = "MiseAJourApk")
public class MiseAJourPlugin extends Plugin {
    private File dossier() {
        File d = new File(getContext().getCacheDir(), "maj");
        d.mkdirs();
        return d;
    }

    @PluginMethod
    public void nettoyer(PluginCall call) {
        File[] l = dossier().listFiles();
        if (l != null) for (File f : l) f.delete();
        call.resolve();
    }

    @PluginMethod
    public void telecharger(final PluginCall call) {
        final String url = call.getString("url");
        final String sha = call.getString("sha256");
        if (url == null) { call.reject("Adresse manquante."); return; }
        new Thread(() -> {
            File part = new File(dossier(), "gestock.apk.part");
            try {
                File[] anciens = dossier().listFiles();
                if (anciens != null) for (File f : anciens) f.delete();
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setInstanceFollowRedirects(true);
                int code = c.getResponseCode();
                if (code != 200) throw new Exception("erreur " + code);
                long total = c.getContentLengthLong();
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                long recu = 0;
                long dernier = 0;
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                    byte[] b = new byte[65536];
                    int n;
                    while ((n = in.read(b)) > 0) {
                        out.write(b, 0, n);
                        md.update(b, 0, n);
                        recu += n;
                        long t = System.currentTimeMillis();
                        if (t - dernier > 300) {
                            dernier = t;
                            JSObject p = new JSObject();
                            p.put("recu", recu);
                            p.put("total", total);
                            notifyListeners("progression", p);
                        }
                    }
                }
                StringBuilder hex = new StringBuilder();
                for (byte x : md.digest()) hex.append(String.format("%02x", x));
                if (sha != null && !sha.equalsIgnoreCase(hex.toString())) {
                    part.delete();
                    throw new Exception("fichier abîmé (empreinte différente), réessayez");
                }
                File apk = new File(dossier(), "gestock.apk");
                if (!part.renameTo(apk)) throw new Exception("enregistrement impossible");
                JSObject r = new JSObject();
                r.put("chemin", apk.getAbsolutePath());
                r.put("taille", recu);
                call.resolve(r);
            } catch (Exception e) {
                part.delete();
                call.reject("Téléchargement impossible : " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void installer(PluginCall call) {
        String chemin = call.getString("chemin");
        File apk = chemin == null ? null : new File(chemin);
        if (apk == null || !apk.exists()) { call.reject("Fichier de mise à jour introuvable."); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            JSObject r = new JSObject();
            r.put("autorisation", true);
            call.resolve(r);
            return;
        }
        Uri u = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(u, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve(new JSObject());
    }
}
