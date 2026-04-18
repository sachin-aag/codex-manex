import { notFound } from "next/navigation";

import { RdTicket } from "@/components/rd/rd-ticket";
import { getRdCase } from "@/lib/db/cases";
import {
  getBomForProductAndPart,
  getClaimLagForPart,
  getCrossArticleBomExposure,
  getInFactoryHistoryForPart,
  getSupplierBatch,
  listRdDecisionsForCase,
} from "@/lib/db/rd";

export const dynamic = "force-dynamic";

type Params = { caseId: string };

export default async function RdTicketPage({ params }: { params: Promise<Params> }) {
  const { caseId } = await params;

  const kase = await getRdCase(caseId);
  if (!kase) notFound();

  const [inFactoryHistory, claimHistory, bomOnThisProduct, crossExposure, decisions] =
    await Promise.all([
      getInFactoryHistoryForPart(kase.partNumber, { limit: 20 }),
      getClaimLagForPart(kase.partNumber),
      getBomForProductAndPart(kase.productId, kase.partNumber),
      getCrossArticleBomExposure(kase.partNumber),
      listRdDecisionsForCase(kase.id),
    ]);

  const installedBatchId = bomOnThisProduct[0]?.batch_id ?? null;
  const supplierBatch = installedBatchId ? await getSupplierBatch(installedBatchId) : null;

  return (
    <RdTicket
      kase={kase}
      inFactoryHistory={inFactoryHistory}
      claimHistory={claimHistory}
      bomOnThisProduct={bomOnThisProduct}
      supplierBatch={supplierBatch}
      crossExposure={crossExposure}
      decisions={decisions}
    />
  );
}
