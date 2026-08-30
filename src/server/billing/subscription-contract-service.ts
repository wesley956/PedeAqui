import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const CURRENT_SUBSCRIPTION_CONTRACT_VERSION = "2026.09-v1";
export const CURRENT_SUBSCRIPTION_CONTRACT_TITLE = "Contrato de Licença de Uso e Prestação de Serviços – PedeAqui";
export const CONTRACTOR_IDENTITY_SETTING_KEY = "legal.contractor.identity";

type ContractorIdentity = {
  legal_name: string;
  tax_id: string;
  address: string;
  city_state: string;
  email: string;
};

type ContractSection = { number: number; title: string; paragraphs: string[] };

export type SubscriptionContractDocument = {
  title: string;
  version: string;
  effective_date: string;
  contractor: ContractorIdentity;
  sections: ContractSection[];
};

export type ContractCommercialSnapshot = {
  organization_id: string;
  organization_name: string;
  subscription_id: string;
  plan_key: string;
  plan_name: string;
  billing_interval: string;
  price_cents: number;
  currency: string;
  billing_due_day: number | null;
  next_due_at: string | null;
  price_locked: boolean;
  founder_slot: number | null;
  founder_member_since: string | null;
  addons: Array<{ name: string; unit_price_cents: number; quantity: number; currency: string }>;
  modules: string[];
  captured_at: string;
};

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

export class SubscriptionContractService {
  static async contractorIdentity() {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_settings")
      .select("value, active")
      .eq("key", CONTRACTOR_IDENTITY_SETTING_KEY)
      .maybeSingle();
    if (error) throw error;
    const raw = data?.value && typeof data.value === "object" && !Array.isArray(data.value)
      ? data.value as Record<string, unknown>
      : {};
    const identity: ContractorIdentity = {
      legal_name: text(raw.legal_name),
      tax_id: text(raw.tax_id),
      address: text(raw.address),
      city_state: text(raw.city_state),
      email: text(raw.email),
    };
    return { identity, active: data?.active === true, complete: data?.active === true && Object.values(identity).every(Boolean) };
  }

  static document(identity: ContractorIdentity): SubscriptionContractDocument {
    const contractor = `${identity.legal_name}, inscrita no CNPJ/CPF sob nº ${identity.tax_id}, com endereço em ${identity.address}, ${identity.city_state}, contato ${identity.email}`;
    return {
      title: CURRENT_SUBSCRIPTION_CONTRACT_TITLE,
      version: CURRENT_SUBSCRIPTION_CONTRACT_VERSION,
      effective_date: "2026-09-01",
      contractor: identity,
      sections: [
        { number: 1, title: "Identificação das partes", paragraphs: [`CONTRATADA: ${contractor}, responsável pela plataforma PedeAqui. CONTRATANTE: a pessoa jurídica, empresário individual ou profissional identificado no Anexo Comercial da assinatura.`, "O representante que realiza o aceite declara possuir poderes suficientes para contratar o PedeAqui em nome do CLIENTE."] },
        { number: 2, title: "Objeto", paragraphs: ["Este contrato regula a licença de uso, em caráter não exclusivo e intransferível, da plataforma PedeAqui e a prestação dos serviços tecnológicos disponibilizados conforme o plano contratado.", "Os módulos, preço, vencimento e demais condições comerciais constam do Anexo Comercial da assinatura. A contratação não transfere propriedade sobre software, código-fonte, infraestrutura, marcas ou demais ativos tecnológicos."] },
        { number: 3, title: "Planos e módulos", paragraphs: ["O PedeAqui poderá oferecer os planos Essencial, Profissional, Completo, Personalizado e Plano Fundadores, além de módulos adicionais. A composição efetiva será a registrada no Anexo Comercial.", "Dependências técnicas indispensáveis poderão ser habilitadas automaticamente. A simples disponibilização de um novo módulo não significa inclusão automática no plano, salvo condição comercial expressa."] },
        { number: 4, title: "Plano Fundadores", paragraphs: ["O Plano Fundadores é condição comercial especial, limitada e não ofertada publicamente, concedida somente aos estabelecimentos identificados pelo PedeAqui.", "O preço Fundador registrado no Anexo Comercial permanece protegido enquanto vigente o mesmo vínculo comercial reconhecido pelo PedeAqui. Ativar ou desativar módulos e uma suspensão temporária por inadimplência não eliminam, por si só, essa condição.", "Após encerramento definitivo e nova contratação, a recuperação da condição Fundador dependerá de autorização expressa. O Clube Fundadores, PedeCoins, recompensas e campanhas são benefícios distintos e não alteram o preço protegido do Plano Fundadores."] },
        { number: 5, title: "Preço, cobrança e vencimento", paragraphs: ["O CLIENTE pagará a mensalidade e no vencimento indicados no Anexo Comercial. O PedeAqui poderá disponibilizar PIX e outros meios de pagamento e emitir a cobrança antecipadamente.", "Se um PIX expirar, poderá ser gerada nova cobrança vinculada à mesma mensalidade, sem duplicação da competência. A confirmação do pagamento atualiza a competência e o próximo vencimento."] },
        { number: 6, title: "Atraso e inadimplência", paragraphs: ["A mensalidade é considerada em atraso após o vencimento sem confirmação de pagamento. O atraso não cancela imediatamente a conta.", "Persistindo a inadimplência após o período de tolerância informado, o PedeAqui poderá suspender recursos até a regularização, sem excluir automaticamente os dados da empresa ou a condição Fundador quando aplicável."] },
        { number: 7, title: "Vigência e cancelamento", paragraphs: ["A contratação é por prazo indeterminado, com cobrança mensal, salvo condição específica no Anexo Comercial. Não há fidelidade anual obrigatória salvo contratação futura expressamente aceita.", "O CLIENTE poderá solicitar cancelamento. O PedeAqui poderá encerrar o contrato por fraude, uso ilícito, violação deliberada de segurança, exploração não autorizada, inadimplência prolongada ou violação grave e reiterada deste contrato."] },
        { number: 8, title: "Obrigações do PedeAqui", paragraphs: ["O PedeAqui deverá disponibilizar os recursos contratados, manter medidas técnicas e administrativas compatíveis, corrigir falhas relevantes conforme criticidade, preservar segregação lógica entre empresas, manter registros necessários à segurança/auditoria/faturamento e tratar dados pessoais conforme a legislação aplicável."] },
        { number: 9, title: "Obrigações do CLIENTE", paragraphs: ["O CLIENTE deverá fornecer informações verdadeiras, proteger credenciais, manter preços e dados operacionais corretos, cumprir suas obrigações fiscais, sanitárias, consumeristas, trabalhistas e comerciais, utilizar a plataforma licitamente e manter dados de cobrança e contato atualizados."] },
        { number: 10, title: "Pedidos e relação com o consumidor final", paragraphs: ["O estabelecimento é responsável pelos produtos e serviços comercializados, incluindo disponibilidade, qualidade, preços, promoções, preparo, entrega, cancelamentos, reembolsos e documentos fiscais quando exigidos.", "O PedeAqui atua como ferramenta tecnológica de recebimento, organização e gestão dos pedidos e não se torna vendedor dos produtos do estabelecimento apenas por fornecer a infraestrutura."] },
        { number: 11, title: "Integrações de terceiros", paragraphs: ["Recursos podem depender de hospedagem, banco de dados, meios de pagamento, WhatsApp/Meta, mapas, impressão, notificações e outros terceiros. Indisponibilidades desses serviços podem afetar temporariamente funções do PedeAqui.", "Integrações de pagamento dos pedidos do restaurante e a cobrança da assinatura PedeAqui permanecem lógica e contabilmente separadas."] },
        { number: 12, title: "Disponibilidade, manutenção e atualizações", paragraphs: ["O PedeAqui buscará disponibilidade contínua, sem garantia de operação absolutamente ininterrupta. Poderão ocorrer interrupções por manutenção, atualização, infraestrutura, terceiros, incidentes de segurança, caso fortuito ou força maior.", "Atualizações corretivas, de segurança e evolução ordinária estão incluídas, salvo recursos expressamente comercializados à parte."] },
        { number: 13, title: "Propriedade intelectual", paragraphs: ["Marca, código, componentes, interfaces, arquitetura e documentação do PedeAqui são protegidos. O CLIENTE recebe licença de uso durante a vigência.", "Permanecem pertencentes ao CLIENTE seus dados empresariais, catálogo, materiais próprios e conteúdo de sua titularidade."] },
        { number: 14, title: "Proteção de dados pessoais", paragraphs: ["As partes observarão a LGPD e normas aplicáveis. Em relação a dados de consumidores tratados para executar pedidos, o CLIENTE atua, em regra, como Controlador e o PedeAqui como Operador.", "O PedeAqui poderá atuar como Controlador independente para administração de contas, segurança, prevenção a fraude, faturamento, cobrança, suporte, auditoria e cumprimento de obrigações legais.", "O PedeAqui poderá utilizar suboperadores necessários e adotará medidas razoáveis de segurança e procedimentos de incidente. Após o encerramento, dados poderão ser retidos enquanto houver finalidade legal legítima e depois eliminados ou anonimizados quando cabível."] },
        { number: 15, title: "Confidencialidade", paragraphs: ["As partes protegerão informações confidenciais, incluindo dados técnicos não públicos, credenciais, estratégias, informações financeiras e operacionais. A obrigação subsiste enquanto a informação mantiver natureza confidencial."] },
        { number: 16, title: "Segurança e acessos", paragraphs: ["Cada usuário deve utilizar credenciais próprias. O CLIENTE administra acessos de colaboradores. O PedeAqui poderá manter trilhas de auditoria, logs e histórico de ações e bloquear sessões diante de risco concreto de segurança ou fraude."] },
        { number: 17, title: "Suporte", paragraphs: ["O suporte abrange orientação de uso e investigação de falhas da plataforma. Não inclui, salvo contratação específica, administração do estabelecimento, manutenção da internet/equipamentos de terceiros ou consultoria contábil, fiscal ou jurídica."] },
        { number: 18, title: "Limitação e alocação de responsabilidades", paragraphs: ["Cada parte responde pelos danos diretos que causar por descumprimento de suas obrigações, nos limites permitidos pela legislação.", "O PedeAqui não responde por prejuízos exclusivamente decorrentes de dados incorretos do CLIENTE, internet/energia/equipamentos sob sua responsabilidade, indisponibilidade exclusiva de terceiro fora do controle razoável, uso indevido de credenciais, decisões comerciais ou produtos/entregas do estabelecimento.", "Nenhuma cláusula exclui responsabilidade que legalmente não possa ser afastada."] },
        { number: 19, title: "Alteração do contrato", paragraphs: ["O contrato poderá ser atualizado para refletir alterações legais, tecnológicas, de segurança ou evolução do serviço. Mudanças relevantes terão nova versão e serão comunicadas.", "Uma alteração geral não elimina condição comercial individual protegida no Anexo Comercial, como preço Fundador. Quando necessário, será solicitado novo aceite e versões anteriores permanecerão preservadas."] },
        { number: 20, title: "Aceite eletrônico e prova da contratação", paragraphs: ["As partes reconhecem a contratação eletrônica mediante autenticação do responsável e ação inequívoca de aceite.", "O PedeAqui poderá registrar empresa, usuário, representante, e-mail/documento, plano, preço, módulos, versão, hash do documento, data/hora, IP, user-agent, assinatura e protocolo. O registro integra o histórico contratual e o CLIENTE poderá consultar o documento e comprovante em Minha assinatura."] },
        { number: 21, title: "Comunicações", paragraphs: ["Comunicações contratuais poderão ocorrer pela plataforma, e-mail, WhatsApp cadastrado ou outro canal indicado. O CLIENTE deve manter seus contatos atualizados. Avisos operacionais rotineiros não constituem alteração contratual."] },
        { number: 22, title: "Disposições gerais", paragraphs: ["A tolerância pontual não implica renúncia permanente. Se uma cláusula for inválida, as demais permanecem vigentes na medida permitida.", "Anexo Comercial, Política de Privacidade e documentos incorporados complementam este contrato. Em divergência exclusivamente comercial, o Anexo prevalece quanto a preço, plano, vencimento, módulos e benefícios expressos."] },
        { number: 23, title: "Legislação e foro", paragraphs: ["Este contrato é regido pelas leis da República Federativa do Brasil. As partes buscarão solução amigável e, não sendo possível, observarão o foro legalmente aplicável; o foro específico da CONTRATADA poderá ser definido na identificação jurídica, ressalvadas competências obrigatórias previstas em lei."] },
      ],
    };
  }

  static canonicalEvidence(document: SubscriptionContractDocument, commercial: ContractCommercialSnapshot) {
    return JSON.stringify({ contract: document, commercial });
  }

  static sha256(document: SubscriptionContractDocument, commercial: ContractCommercialSnapshot) {
    return createHash("sha256").update(this.canonicalEvidence(document, commercial), "utf8").digest("hex");
  }

  static protocol() {
    return `PA-CONTRACT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
