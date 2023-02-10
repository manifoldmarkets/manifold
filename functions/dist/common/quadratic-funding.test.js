"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const quadratic_funding_1 = require("./quadratic-funding");
function makeTxn(fromId, toId, amount, data) {
    return { fromId, toId, amount, data };
}
test('Quadratic matches work correctly against numeric instability', () => {
    const txns = [makeTxn('a', 'b', 65, { answerId: 'c' })];
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const matches = (0, quadratic_funding_1.quadraticMatches)(txns, 500, 'data.answerId');
    expect(matches['c']).toEqual(0);
});
//# sourceMappingURL=quadratic-funding.test.js.map