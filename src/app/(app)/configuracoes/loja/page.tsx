import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveStoreProfileAction } from "@/features/stores/actions";
import { StoreProfileService } from "@/server/stores/store-profile-service";

export default async function StoreProfileSettingsPage() {
  const store = await StoreProfileService.getProfile();
  const publicHref = `/m/${store.slug}`;
  const publicUrl = `https://pedeaqui.pp.ua${publicHref}`;

  return (
    <section style={{ display: "grid", gap: 20, maxWidth: 920 }}>
      <header>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Configurações</p>
        <h1 style={{ margin: "4px 0" }}>Dados da loja</h1>
        <p className="muted" style={{ margin: 0 }}>
          Edite o nome, contato e localização usados pelo PedeAqui. Nome, telefone, cidade e estado concluem o primeiro passo do assistente.
        </p>
      </header>

      <form action={saveStoreProfileAction} className="card" style={{ padding: 20, display: "grid", gap: 18 }}>
        <div>
          <h2 style={{ margin: 0 }}>Identificação e contato</h2>
          <p className="muted" style={{ marginBottom: 0 }}>Você pode trocar o nome da loja quando quiser sem alterar o endereço público do cardápio.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <Input label="Nome da loja" name="name" defaultValue={store.name} required maxLength={120} autoComplete="organization" />
          <Input label="Telefone" name="phone" defaultValue={store.phone ?? ""} required type="tel" inputMode="tel" autoComplete="tel" hint="Este telefone pode aparecer em Informações da loja no cardápio público." />
          <Input label="E-mail" name="email" defaultValue={store.email ?? ""} type="email" autoComplete="email" hint="Uso administrativo. Não é publicado automaticamente no cardápio." />
          <Input label="CEP" name="postalCode" defaultValue={store.postal_code ?? ""} inputMode="numeric" autoComplete="postal-code" />
        </div>

        <div>
          <h2 style={{ margin: 0 }}>Endereço</h2>
          <p className="muted" style={{ marginBottom: 0 }}>Cidade e estado são obrigatórios porque ajudam pedidos, entrega e informações públicas da unidade.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          <Input label="Rua / avenida" name="street" defaultValue={store.street ?? ""} autoComplete="street-address" />
          <Input label="Número" name="number" defaultValue={store.number ?? ""} />
          <Input label="Complemento" name="complement" defaultValue={store.complement ?? ""} />
          <Input label="Bairro" name="district" defaultValue={store.district ?? ""} />
          <Input label="Cidade" name="city" defaultValue={store.city ?? ""} required autoComplete="address-level2" />
          <Input label="Estado / UF" name="state" defaultValue={store.state ?? ""} required autoComplete="address-level1" hint="Ex.: SP" />
        </div>

        <div style={{ borderTop: "var(--border-width) solid var(--border-default)", paddingTop: 18 }}>
          <h2 style={{ margin: 0 }}>Informações públicas</h2>
          <p className="muted" style={{ marginBottom: 0 }}>Campos opcionais exibidos em “Informações da loja”. Deixe em branco o que não quiser publicar.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          <Input label="WhatsApp público" name="publicWhatsapp" defaultValue={store.public_whatsapp ?? ""} type="tel" inputMode="tel" autoComplete="tel" hint="Número usado apenas para o botão Falar com a loja. Não usa IDs técnicos da Meta." />
          <Input label="Site" name="websiteUrl" defaultValue={store.website_url ?? ""} type="url" placeholder="https://seusite.com.br" />
          <Input label="Instagram" name="instagramUrl" defaultValue={store.instagram_url ?? ""} type="url" placeholder="https://instagram.com/sualoja" />
          <Input label="Facebook" name="facebookUrl" defaultValue={store.facebook_url ?? ""} type="url" placeholder="https://facebook.com/sualoja" />
          <Input label="TikTok" name="tiktokUrl" defaultValue={store.tiktok_url ?? ""} type="url" placeholder="https://tiktok.com/@sualoja" />
        </div>

        <div><Button type="submit" loadingLabel="Salvando…">Salvar dados da loja</Button></div>
      </form>

      <article className="card" style={{ padding: 20, display: "grid", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Link público do cardápio</h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>Trocar o nome da loja não muda este link. Assim, links já enviados no WhatsApp ou Instagram continuam funcionando.</p>
        </div>
        <code style={{ overflowWrap: "anywhere" }}>{publicUrl}</code>
        <div><Link href={publicHref} target="_blank" rel="noreferrer">Abrir cardápio público →</Link></div>
      </article>

      <article className="card" style={{ padding: 20 }}>
        <strong>Aparência do cardápio</strong>
        <p className="muted">Logo, capa, cor, publicação e pedido mínimo continuam separados dos dados cadastrais da loja.</p>
        <Link href="/configuracoes/cardapio">Editar aparência e publicação →</Link>
      </article>
    </section>
  );
}
