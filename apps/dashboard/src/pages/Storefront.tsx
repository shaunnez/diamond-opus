import { Header } from '../components/layout/Header';


export function Storefront() {

  return (
    <>
      <Header />
      <div className="h-[calc(100vh-4rem)]">
        <iframe
          src={import.meta.env.VITE_STOREFRONT_URL ?? '/storefront'}
          title="Storefront"
          className="w-full h-full border-0"
          allow="same-origin"
        />
      </div>
    </>
  );
}
