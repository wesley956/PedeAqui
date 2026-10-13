import styles from "./cashflow-chart.module.css";

type Day = { day: string; net_cents: number | string };

const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cents / 100);
const shortDate = (value: string) => { const [, m, d] = value.slice(0, 10).split("-"); return d && m ? `${d}/${m}` : value; };

/**
 * Saldo realizado por dia (entradas − saídas) no período do Financeiro.
 * Barras para cima em verde (dia positivo) e para baixo em vermelho (dia negativo),
 * medidas a partir do zero. Desenhado no servidor, sem biblioteca.
 */
export function CashflowChart({ daily }: { daily: readonly Day[] }) {
  const rows = daily.map((row) => ({ day: row.day, net: Number(row.net_cents ?? 0) })).filter((row) => Number.isFinite(row.net));
  if (rows.length === 0) {
    return <p className={styles.empty}>Sem entradas ou saídas realizadas no período.</p>;
  }

  const width = 720, height = 220, left = 64, right = 12, y0 = 16, bottom = 28;
  const plotW = width - left - right, plotH = height - y0 - bottom;
  const max = Math.max(0, ...rows.map((row) => row.net));
  const min = Math.min(0, ...rows.map((row) => row.net));
  const span = max - min || 1;
  const y = (value: number) => y0 + ((max - value) / span) * plotH;
  const zero = y(0);
  const band = plotW / rows.length;
  const barW = Math.max(2, Math.min(28, band * 0.7));
  const positiveDays = rows.filter((row) => row.net > 0).length;
  const negativeDays = rows.filter((row) => row.net < 0).length;
  const labelDays = rows.length <= 3 ? rows.map((_, index) => index) : [0, Math.floor((rows.length - 1) / 2), rows.length - 1];

  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Saldo realizado por dia: ${positiveDays} dia(s) positivos e ${negativeDays} negativos no período`} className={styles.svg}>
        <g className={styles.grid}>
          {max > 0 ? <><line x1={left} x2={width - right} y1={y(max)} y2={y(max)} /><text x={left - 8} y={y(max) + 4} textAnchor="end">{brl(max)}</text></> : null}
          {min < 0 ? <><line x1={left} x2={width - right} y1={y(min)} y2={y(min)} /><text x={left - 8} y={y(min) + 4} textAnchor="end">{brl(min)}</text></> : null}
        </g>
        <g>
          {rows.map((row, index) => {
            const x = left + index * band + (band - barW) / 2;
            const top = row.net >= 0 ? y(row.net) : zero;
            const h = Math.max(1, Math.abs(y(row.net) - zero));
            return <rect key={row.day} x={x} y={top} width={barW} height={h} rx={2} className={row.net >= 0 ? styles.positive : styles.negative}><title>{`${shortDate(row.day)}: ${brl(row.net)}`}</title></rect>;
          })}
        </g>
        <line x1={left} x2={width - right} y1={zero} y2={zero} className={styles.zero} />
        <text x={left - 8} y={zero + 4} textAnchor="end" className={styles.axisText}>R$ 0</text>
        <g className={styles.axisText}>
          {rows.map((row, index) => labelDays.includes(index) ? <text key={row.day} x={left + index * band + band / 2} y={height - 8} textAnchor="middle">{shortDate(row.day)}</text> : null)}
        </g>
      </svg>
      <figcaption className={styles.caption}>
        <span><i className={styles.swatchPositive} /> dia com mais entradas</span>
        <span><i className={styles.swatchNegative} /> dia com mais saídas</span>
      </figcaption>
    </figure>
  );
}
