import OptimizerApp from "@/components/OptimizerApp";
import { loadAppData } from "@/lib/load-app-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await loadAppData();
  return <OptimizerApp initialData={data} />;
}
