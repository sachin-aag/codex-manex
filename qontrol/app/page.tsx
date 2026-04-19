import { Suspense } from "react";

import { QontrolApp } from "@/components/qontrol-app";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <QontrolApp />
    </Suspense>
  );
}
