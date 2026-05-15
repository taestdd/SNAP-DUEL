export function effectLabel(type: string, damageType?: string): string {
  if (type === "damage" && damageType === "ground") return "⬇ Ground";
  if (type === "damage" && damageType === "anti-air") return "⬆ Anti-Air";
  switch (type) {
    case "damage":      return "Damage";
    case "block":       return "Block";
    case "draw":        return "Draw";
    case "heal":        return "Heal";
    case "buff_attack": return "ATK+";
    case "burn":        return "Burn";
    case "tag":         return "⇄ Tag";
    case "airborne":    return "⬆ Launch";
    case "move_cards":  return "Move";
    case "shuffle":     return "Shuffle";
    case "generate":    return "Generate";
    default:            return type;
  }
}
