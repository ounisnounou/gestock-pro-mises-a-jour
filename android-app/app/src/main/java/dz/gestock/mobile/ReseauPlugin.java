package dz.gestock.mobile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;

/** Adresses IPv4 du téléphone (Wi-Fi) : l'application cherche le poste serveur Gestock sur le même réseau. */
@CapacitorPlugin(name = "Reseau")
public class ReseauPlugin extends Plugin {
    @PluginMethod
    public void adresses(PluginCall call) {
        JSArray liste = new JSArray();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback() || ni.isVirtual()) continue;
                String nom = ni.getName() == null ? "" : ni.getName();
                if (nom.startsWith("rmnet") || nom.startsWith("ccmni") || nom.startsWith("dummy")) continue; // données mobiles
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress() && a.isSiteLocalAddress()) liste.put(a.getHostAddress());
                }
            }
        } catch (Exception e) {
            call.reject("Réseau illisible : " + e.getMessage());
            return;
        }
        JSObject r = new JSObject();
        r.put("adresses", liste);
        call.resolve(r);
    }
}
