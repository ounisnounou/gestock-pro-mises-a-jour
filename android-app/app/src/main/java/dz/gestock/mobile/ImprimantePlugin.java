package dz.gestock.mobile;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;
import java.util.UUID;

/** Imprimante thermique Bluetooth (profil série SPP) : liste des appareils appairés et envoi des octets ESC/POS. */
@SuppressLint("MissingPermission")
@CapacitorPlugin(name = "Imprimante", permissions = { @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetooth") })
public class ImprimantePlugin extends Plugin {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private boolean manquePermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    private BluetoothAdapter adaptateur(PluginCall call) {
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter a = bm == null ? null : bm.getAdapter();
        if (a == null) { call.reject("Ce téléphone n'a pas de Bluetooth."); return null; }
        if (!a.isEnabled()) { call.reject("Activez le Bluetooth du téléphone."); return null; }
        return a;
    }

    @PluginMethod
    public void appareils(PluginCall call) {
        if (manquePermission()) { requestPermissionForAlias("bluetooth", call, "apresPermissionAppareils"); return; }
        lister(call);
    }

    @PermissionCallback
    private void apresPermissionAppareils(PluginCall call) {
        if (manquePermission()) { call.reject("Autorisation Bluetooth refusée."); return; }
        lister(call);
    }

    private void lister(PluginCall call) {
        BluetoothAdapter a = adaptateur(call);
        if (a == null) return;
        JSArray l = new JSArray();
        for (BluetoothDevice d : a.getBondedDevices()) {
            JSObject o = new JSObject();
            o.put("nom", d.getName() == null ? d.getAddress() : d.getName());
            o.put("adresse", d.getAddress());
            BluetoothClass c = d.getBluetoothClass();
            o.put("imprimante", c != null && c.getMajorDeviceClass() == BluetoothClass.Device.Major.IMAGING);
            l.put(o);
        }
        JSObject r = new JSObject();
        r.put("appareils", l);
        call.resolve(r);
    }

    @PluginMethod
    public void imprimer(PluginCall call) {
        if (manquePermission()) { requestPermissionForAlias("bluetooth", call, "apresPermissionImprimer"); return; }
        envoyer(call);
    }

    @PermissionCallback
    private void apresPermissionImprimer(PluginCall call) {
        if (manquePermission()) { call.reject("Autorisation Bluetooth refusée."); return; }
        envoyer(call);
    }

    private void envoyer(final PluginCall call) {
        final String adresse = call.getString("adresse");
        final String donnees = call.getString("donnees");
        if (adresse == null || donnees == null) { call.reject("Imprimante ou ticket manquant."); return; }
        final BluetoothAdapter a = adaptateur(call);
        if (a == null) return;
        new Thread(() -> {
            BluetoothSocket s = null;
            try {
                byte[] octets = Base64.decode(donnees, Base64.DEFAULT);
                BluetoothDevice d = a.getRemoteDevice(adresse);
                try { a.cancelDiscovery(); } catch (Exception ignore) { }
                try {
                    s = d.createRfcommSocketToServiceRecord(SPP);
                    s.connect();
                } catch (Exception e1) {
                    try { if (s != null) s.close(); } catch (Exception ignore) { }
                    s = d.createInsecureRfcommSocketToServiceRecord(SPP);
                    s.connect();
                }
                OutputStream out = s.getOutputStream();
                int pas = 256;
                for (int i = 0; i < octets.length; i += pas) {
                    out.write(octets, i, Math.min(pas, octets.length - i));
                    out.flush();
                    Thread.sleep(12);
                }
                Thread.sleep(400);
                call.resolve();
            } catch (Exception e) {
                call.reject("Impression impossible : vérifiez que l'imprimante est allumée et proche. (" + e.getMessage() + ")");
            } finally {
                try { if (s != null) s.close(); } catch (Exception ignore) { }
            }
        }).start();
    }
}
