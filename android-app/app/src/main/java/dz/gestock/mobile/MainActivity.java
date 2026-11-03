package dz.gestock.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReseauPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
