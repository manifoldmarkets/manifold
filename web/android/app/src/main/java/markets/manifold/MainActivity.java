package markets.manifold;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.baumblatt.capacitor.firebase.auth.CapacitorFirebaseAuth;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(CapacitorFirebaseAuth.class);
  }
}