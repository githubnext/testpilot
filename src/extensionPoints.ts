// function getExtensionPoints(prompt: Prompt, ast: any): Prompt[] {
//     let extensionPoints: Prompt[] = [];
//     let fixedPart = prompt.prefix + prompt.snippets + prompt.sign;
//     estraverse.traverse(ast, {
//         enter: function (node: any, parent) {
//             if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
//                 let cutoff = node.end - 1;
//                 if (cutoff >= 0) {
//                     extensionPoints.push({
//                         prefix: prompt.prefix,
//                         sign: prompt.sign,
//                         snippets: prompt.snippets,
//                         code: (fixedPart + prompt.code).slice(fixedPart.length, cutoff),
//                         suffix: (fixedPart + prompt.code).slice(cutoff) + prompt.suffix,
//                         id: prompt.id
//                     });
//                 }
//             }
//         },
//         leave: function (node, parent) {
//             //nothing for now
//         }
//     });
//     // The first element in extensionPoints is for the describe function,
//     // as it is the topmost function definition in the AST.
//     // So we remove it to not add multiple tests.
//     return extensionPoints.slice(1);
// }
