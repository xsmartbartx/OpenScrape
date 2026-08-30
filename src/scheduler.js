const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export function validateCron(expression) {
  try {
    parseCron(expression);
    return null;
  } catch (error) {
    return error.message;
  }
}

export function validateTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return null;
  } catch {
    return 'scheduleTimezone must be a valid IANA timezone.';
  }
}

export function matchesCron(expression, date = new Date(), timeZone = 'UTC') {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parseCron(expression);
  const values = zonedDateParts(date, timeZone);
  const dayOfMonthMatches = matchesField(dayOfMonth, values.day, 1, 31);
  const dayOfWeekMatches = matchesField(dayOfWeek, values.weekday, 0, 6);
  const dayMatches = dayOfMonth === '*' && dayOfWeek === '*'
    ? true
    : dayOfMonth !== '*' && dayOfWeek !== '*'
      ? dayOfMonthMatches || dayOfWeekMatches
      : dayOfMonthMatches && dayOfWeekMatches;
  return matchesField(minute, values.minute, 0, 59)
    && matchesField(hour, values.hour, 0, 23)
    && matchesField(month, values.month, 1, 12)
    && dayMatches;
}

export function createScheduler({ store, runRobot, now = () => new Date(), intervalMs = 15_000 }) {
  let timer = null;
  const completedMinutes = new Map();

  async function tick(date = now()) {
    const minuteKey = date.toISOString().slice(0, 16);
    const dueRobots = store.robots.filter((robot) => robot.scheduleCron && matchesCron(robot.scheduleCron, date, robot.scheduleTimezone ?? 'UTC'));
    for (const robot of dueRobots) {
      if (completedMinutes.get(robot.id) === minuteKey) continue;
      completedMinutes.set(robot.id, minuteKey);
      const run = await store.createRun(robot.id, 'schedule');
      await store.addRunEvent(run.id, { message: `Scheduled run matched ${robot.scheduleCron} (${robot.scheduleTimezone ?? 'UTC'}).` });
      await runRobot(run, robot);
    }
  }

  return {
    tick,
    start() {
      if (timer) return;
      timer = setInterval(() => { void tick(); }, intervalMs);
      void tick();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    }
  };
}

function parseCron(expression) {
  if (typeof expression !== 'string') throw new Error('scheduleCron must be a five-field cron expression.');
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('scheduleCron must be a five-field cron expression.');
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  fields.forEach((field, index) => validateField(field, ...ranges[index]));
  return fields;
}

function validateField(field, min, max) {
  if (!field) throw new Error('scheduleCron contains an empty field.');
  field.split(',').forEach((part) => {
    const sections = part.split('/');
    if (sections.length > 2) throw new Error(`Invalid cron field "${field}".`);
    const [range, step] = sections;
    if (step !== undefined && (!/^\d+$/.test(step) || Number(step) < 1 || Number(step) > max - min + 1)) throw new Error(`Invalid cron step "${step}".`);
    if (range === '*') return;
    const match = range.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error(`Invalid cron field "${field}".`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < min || end > max || start > end) throw new Error(`Cron value must be between ${min} and ${max}.`);
  });
}

function matchesField(field, value, min, max) {
  return field.split(',').some((part) => {
    const [range, stepText] = part.split('/');
    const step = Number(stepText ?? 1);
    const match = range === '*' ? [min, max] : range.split('-').map(Number);
    const start = match[0];
    const end = match[1] ?? start;
    return value >= start && value <= end && (value - start) % step === 0;
  });
}

function zonedDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { month: Number(get('month')), day: Number(get('day')), hour: Number(get('hour')), minute: Number(get('minute')), weekday: WEEKDAYS[get('weekday').toLowerCase()] };
}
