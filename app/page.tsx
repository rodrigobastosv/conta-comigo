import { Story } from "@/components/story";
import { LOST_THINGS_SHOP } from "@/lib/story-bibles/loja-de-coisas-perdidas";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-8">
      <Story title={LOST_THINGS_SHOP.title} />
    </main>
  );
}
