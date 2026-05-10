export type ManualHltvMatch = {
  id: string;
  tournament: string;
  team1: string;
  team2: string;
  date: string;
};

export function parseHltvCopiedText(text: string): ManualHltvMatch[] {
  const allLines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const lines: string[] = [];

  for (let i = 0; i < allLines.length; i++) {
    if (i > 0 && allLines[i] === allLines[i - 1]) continue;
    lines.push(allLines[i]);
  }

  const timeOnlyRegex = /^\d{1,2}:\d{2}$/;
  const timeStartRegex = /^(\d{1,2}:\d{2})\s+(.+)/;
  const dateRegex = /\d{4}-\d{2}-\d{2}/;
  const boRegex = /^(bo\d|во[з3s]|b[o0]\d)$/i;
  const boStartRegex = /^(bo\d|во[з3s]|b[o0]\d)\s+(.+)/i;

  const result: ManualHltvMatch[] = [];
  let currentTime = "Unknown";
  let currentDate = "";
  const teamNames: { name: string; time: string; date: string }[] = [];

  const cleanName = (s: string) => {
    return s
      .replace(/[®©@|«»<>+%#§°^~]/g, "")
      .replace(/^[^a-zA-Zа-яА-Я0-9]+\s*/g, "")
      .replace(/^[a-zA-Zа-яА-Я]\s+/g, "")
      .replace(/\s+(Lal|lal|LI|li|ll|Lall|lall)$/i, "")
      .replace(/\s+[A-Z]$/, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  for (const line of lines) {
    if (dateRegex.test(line)) {
      const dm = line.match(dateRegex);
      if (dm) currentDate = dm[0];
      continue;
    }

    if (timeOnlyRegex.test(line)) {
      currentTime = line;
      continue;
    }

    const timeTeamMatch = line.match(timeStartRegex);
    if (timeTeamMatch) {
      currentTime = timeTeamMatch[1];
      const rest = cleanName(timeTeamMatch[2]);
      if (rest.length > 1) {
        teamNames.push({ name: rest, time: currentTime, date: currentDate });
      }
      continue;
    }

    if (boRegex.test(line)) continue;

    const boTeamMatch = line.match(boStartRegex);
    if (boTeamMatch) {
      const rest = cleanName(boTeamMatch[2]);
      if (rest.length > 1) {
        teamNames.push({ name: rest, time: currentTime, date: currentDate });
      }
      continue;
    }

    const cleaned = cleanName(line);
    if (cleaned.length > 1) {
      teamNames.push({ name: cleaned, time: currentTime, date: currentDate });
    }
  }

  for (let i = 0; i < teamNames.length - 1; i += 2) {
    const t1 = teamNames[i];
    const t2 = teamNames[i + 1];
    let dateStr = t1.time;

    if (t1.date) {
      const [y, mo, d] = t1.date.split("-");
      dateStr = `${d}.${mo}.${y} ${t1.time}:00`;
    }

    result.push({
      id: `hltv-${stableMatchKey(t1.name, t2.name, dateStr).slice(0, 10)}`,
      tournament: "HLTV Import",
      team1: t1.name,
      team2: t2.name,
      date: dateStr,
    });
  }

  return result;
}

function stableMatchKey(team1: string, team2: string, date: string) {
  let hash = 0;
  const value = `${team1}|${team2}|${date}`;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(8, "0");
}
