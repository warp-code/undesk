import { SolanaProvider } from "./_providers/SolanaProvider";
import { OtcProvider } from "./_providers/OtcProvider";
import { DerivedKeysProvider } from "./_providers/DerivedKeysProvider";

export default function OtcLayout({ children }: { children: React.ReactNode }) {
  return (
    <SolanaProvider>
      <OtcProvider>
        <DerivedKeysProvider>{children}</DerivedKeysProvider>
      </OtcProvider>
    </SolanaProvider>
  );
}
