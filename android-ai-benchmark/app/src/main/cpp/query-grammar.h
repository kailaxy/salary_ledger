#pragma once
namespace bench { inline constexpr const char *query_grammar=R"GBNF(root ::= ws (status | query) ws
status ::= "{" ws "\"status\"" ws ":" ws ("\"unsupported\"" | "\"clarify\"") ws "}"
query ::= "{" ws "\"action\"" ws ":" ws "\"query\"" "," ws "\"operation\"" ws ":" ws operation "," ws "\"kind\"" ws ":" ws ("\"expense\"" | "\"income\"") "," ws "\"range\"" ws ":" ws range ("," ws field)* ws "}"
operation ::= "\"sum\"" | "\"average\"" | "\"min\"" | "\"max\"" | "\"top\"" | "\"count\"" | "\"list\"" | "\"categories\"" | "\"compare\"" | "\"cashflow\"" | "\"share\"" | "\"budgets\"" | "\"funds\"" | "\"loans\"" | "\"trends\"" | "\"frequency\"" | "\"recurring\"" | "\"savings_rate\"" | "\"afford\""
range ::= "\"all\"" | "\"today\"" | "\"yesterday\"" | "\"this_week\"" | "\"last_week\"" | "\"this_month\"" | "\"last_month\"" | "\"this_year\"" | "\"current_period\"" | "\"previous_period\"" | "\"next_period\"" | "\"last_periods\"" | "\"dates\""
field ::= ("\"categoryId\"" ws ":" ws ("\"food\"" | "\"rent\"" | "\"transport\"" | "\"fund\"")) | ("\"loanId\"" ws ":" ws "\"loan\"") | ("\"mode\"" ws ":" ws string) | ("\"unit\"" ws ":" ws string) | ("\"incomeKind\"" ws ":" ws ("\"SALARY\"" | "\"BONUS\"" | "\"OTHER\"")) | ("\"incomeBasis\"" ws ":" ws ("\"salary\"" | "\"all\"")) | (("\"startDate\"" | "\"endDate\"") ws ":" ws string) | (("\"amountMinor\"" | "\"limit\"" | "\"periodCount\"") ws ":" ws integer)
string ::= "\"" [a-zA-Z0-9_-]+ "\""
integer ::= "0" | [1-9] [0-9]{0,8}
ws ::= [ \t\n\r]{0,4}
)GBNF"; }
