package dz.gestock.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReseauPlugin.class);
        registerPlugin(ImprimantePlugin.class);
        registerPlugin(MiseAJourPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
