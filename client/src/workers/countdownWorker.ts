// Countdown worker: posts remaining seconds to main thread every second.
// Receives: { targetDate: string }

self.onmessage = (e) => {
  const { targetDate } = e.data || {};
  if (!targetDate) return;

  const target = new Date(targetDate).getTime();

  function tick() {
    const now = Date.now();
    const diffSeconds = Math.max(0, Math.floor((target - now) / 1000));
    if (diffSeconds <= 0) {
      // final tick then exit
      // send expired message
      // @ts-ignore - worker global
      self.postMessage({ type: 'expired' });
      clearInterval(intervalId);
    } else {
      // send seconds remaining
      // @ts-ignore - worker global
      self.postMessage({ type: 'tick', seconds: diffSeconds });
    }
  }

  tick();
  const intervalId = setInterval(tick, 1000);
};
