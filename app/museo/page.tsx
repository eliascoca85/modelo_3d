import MuseumCanvas from "@/components/museum/museumcanvas";
import { readCuadros } from "@/lib/cuadros";

export const dynamic = "force-dynamic";

export default async function MuseoPage() {
	const cuadros = await readCuadros();
	return <MuseumCanvas cuadros={cuadros} />;
}
