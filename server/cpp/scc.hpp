#pragma once
#include "gtl/vector.hpp"
#include <algorithm>
#include <vector>

constexpr int N = 6919238+10;
constexpr int M = 650409867+10;
using vec = gtl::vector<int>;

template <int MAXN = N, int MAXM = M>
struct edge_list {
	int size=0; vec begin= vec(MAXN,-1), dest= vec(MAXM), next= vec(MAXM);
	void add_edge (int u, int v) { dest[size] = v; next[size] = begin[u]; begin[u] = size++; } };
template <int MAXN = N, int MAXM = M>
struct tarjan {
	vec comp = vec(MAXN,-1); int size, ind, stks;
	vec dfn = vec(MAXN, -1), low = vec(MAXN), ins = vec(MAXN), stk = vec(MAXN);
	void dfs (const edge_list <MAXN, MAXM> &e, int i) {
		dfn[i] = low[i] = ind++;
		ins[i] = 1; stk[stks++] = i;
		for (int x = e.begin[i]; ~x; x = e.next[x]) {
			int j = e.dest[x]; if (!~dfn[j]) {
				dfs (e, j);
				if (low[i] > low[j]) low[i] = low[j];
			} else if (ins[j] && low[i] > dfn[j])
				low[i] = dfn[j]; }
		if (dfn[i] == low[i]) {
			for (int j = -1; j != i; j = stk[--stks], ins[j] = 0, comp[j] = size);
			++size; } }
	void solve (const edge_list <MAXN, MAXM> &e, int n) {
		size = ind = stks = 0;
		for (int i = 0; i < n; ++i) if (!~dfn[i])
			dfs (e, i); } };

typedef long long ll;

namespace kactl {
	using namespace std;
	typedef pair<int, int> pii;
	typedef vector<int> vi;
		
	static vi val, comp, z, cont;
	static int Time, ncomps;
	template<class G, class F> int dfs(int j, G& g, F& f) {
		int low = val[j] = ++Time, x; z.push_back(j);
		for (auto e : g[j]) if (comp[e] < 0)
			low = min(low, val[e] ?: dfs(e,g,f));

		if (low == val[j]) {
			do {
				x = z.back(); z.pop_back();
				comp[x] = ncomps;
				cont.push_back(x);
			} while (x != j);
			f(cont); cont.clear();
			ncomps++;
		}
		return val[j] = low;
	}
	template<class G, class F> void scc(G& g, F f) {
		int n = g.size();
		val.assign(n, 0); comp.assign(n, -1);
		Time = ncomps = 0;
		for (int i=0; i<n; i++) if (comp[i] < 0) dfs(i, g, f);
	}
}