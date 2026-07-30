import { Historia } from "@/components/historia";
import { LOJA_DE_COISAS_PERDIDAS } from "@/lib/story-bibles/loja-de-coisas-perdidas";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-8">
      <Historia titulo={LOJA_DE_COISAS_PERDIDAS.titulo} />
    </main>
  );
}
