import { View, Text, StyleSheet } from 'react-native';
import { brl } from '../../../../packages/core/src/money';
export function Donut({ income, expense }: { income: number; expense: number }) {
  const ratio = income + expense ? income / (income + expense) : 0;
  return (
    <View accessibilityLabel={`Receitas ${brl(income)}, despesas ${brl(expense)}`} style={s.chart}>
      {Array.from({ length: 90 }, (_, i) => {
        const angle = (i * Math.PI * 2) / 90 - Math.PI / 2;
        return (
          <View
            key={i}
            style={[
              s.dot,
              {
                left: 87 + 78 * Math.cos(angle),
                top: 87 + 78 * Math.sin(angle),
                backgroundColor: i / 90 < ratio ? '#0F3B2E' : '#D7DDCE',
              },
            ]}
          />
        );
      })}
      <View style={s.center}>
        <Text style={s.label}>Movimentação do mês</Text>
        <Text style={s.value}>{brl(income + expense)}</Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  chart: { width: 184, height: 184, alignSelf: 'center', position: 'relative', marginVertical: 12 },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  center: { position: 'absolute', inset: 25, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 9, color: '#8C9A7A' },
  value: { fontSize: 18, color: '#0F3B2E', marginTop: 10, fontVariant: ['tabular-nums'] },
});
