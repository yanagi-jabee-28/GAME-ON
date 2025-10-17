export async function asyncDelay(msec: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, msec);
  });
}
