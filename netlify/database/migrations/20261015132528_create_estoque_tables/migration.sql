CREATE TABLE "movimentacoes" (
	"id" serial PRIMARY KEY,
	"data" date NOT NULL,
	"tipo" varchar(10) NOT NULL,
	"quantidade" integer NOT NULL,
	"produtos_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" serial PRIMARY KEY,
	"nome" varchar(255) NOT NULL,
	"valor" numeric(10,2) NOT NULL,
	"quantidade" integer NOT NULL,
	"categoria" varchar(255) NOT NULL,
	"unidade_medida" varchar(30) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_produtos_id_produtos_id_fkey" FOREIGN KEY ("produtos_id") REFERENCES "produtos"("id");--> statement-breakpoint
CREATE VIEW "vw_estoque" AS (select id, nome, quantidade, valor, quantidade * valor as valor_total, categoria from produtos);