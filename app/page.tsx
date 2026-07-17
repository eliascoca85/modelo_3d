import MuseumCanvas from "@/components/museum/museumcanvas";
import { readCuadros } from "@/lib/cuadros";

export const dynamic = "force-dynamic";

export default async function Home() {
	const cuadros = await readCuadros();
	return <MuseumCanvas cuadros={cuadros} />;
}
