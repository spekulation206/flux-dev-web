import { Header } from "@/components/Header";
import { MainApp } from "@/components/MainApp";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <MainApp />
    </div>
  );
}
