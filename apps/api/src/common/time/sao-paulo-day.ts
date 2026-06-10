export const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SAO_PAULO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function getSaoPauloDayBounds(now = new Date()): {
  start: Date;
  end: Date;
} {
  const currentDate = readCalendarDate(now);
  const nextDateValue = new Date(
    Date.UTC(currentDate.year, currentDate.month - 1, currentDate.day + 1),
  );
  const nextDate = {
    year: nextDateValue.getUTCFullYear(),
    month: nextDateValue.getUTCMonth() + 1,
    day: nextDateValue.getUTCDate(),
  };

  return {
    start: zonedMidnightToUtc(currentDate),
    end: zonedMidnightToUtc(nextDate),
  };
}

function readCalendarDate(date: Date): CalendarDate {
  const parts = readDateTimeParts(date);

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

function zonedMidnightToUtc(date: CalendarDate): Date {
  const utcGuess = Date.UTC(date.year, date.month - 1, date.day);
  let result = utcGuess;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = readDateTimeParts(new Date(result));
    const representedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const offset = representedUtc - result;
    result = utcGuess - offset;
  }

  return new Date(result);
}

function readDateTimeParts(date: Date): Record<
  "year" | "month" | "day" | "hour" | "minute" | "second",
  number
> {
  const values = Object.fromEntries(
    dateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return values as Record<
    "year" | "month" | "day" | "hour" | "minute" | "second",
    number
  >;
}
