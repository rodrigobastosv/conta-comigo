import { Story } from "@/components/story";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-8">
      {/* The title is not known here any more: an invented world names itself
          on beat 1, so it belongs to the run, not to the page. */}
      <Story />
    </main>
  );
}
