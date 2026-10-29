import { AppController } from './app.controller.js';
describe('Health', () => {
  it('expone el estado público del servicio', () => {
    expect(new AppController().health()).toMatchObject({
      status: 'ok',
      service: 'user-service',
    });
  });
});
