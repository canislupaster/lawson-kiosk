#include <cstdlib>
#include <ios>
#include <random>
#include <regex>
#include <stdexcept>
#include <string>
#include <sstream>
#include <iostream>
#include <fstream>
#include <array>

#include <gtl/phmap.hpp>
#include <gtl/vector.hpp>
#include <gtl/bit_vector.hpp>

using namespace std;

template<class T>
T convert(T x) {
	if constexpr (endian::native == endian::big) {
		return x;
	} else {
		return byteswap(x);
	}
}

constexpr int wiki_ns = 0;

struct SQLNull {};
using Value = variant<string,int64_t,SQLNull>;

template<class F>
void parse(istream& input, F f) {
	input>>noskipws;

	regex re("^INSERT INTO `[^`]+` VALUES $");

	input.seekg(0,ios_base::end);
	auto total = input.tellg();
	input.seekg(0,ios_base::beg);

	size_t diff = 1e7, next_amt=diff;
	while (input) {
		size_t amt = input.tellg();
		if (amt>next_amt) {
			cout<<"read "<<amt<<"/"<<total<<" ("<<100.0*amt/total<<"%)\n";
			next_amt=amt+diff;
		}

		string buf="";
		while (input) {
			char x; input>>x;
			buf.push_back(x);
			if (x=='\n') buf.clear();
			if (regex_match(buf.c_str(), re)) break;
		}

		if (!input) break;

		int rec_i=0;

		buf.clear();

		string str;
		bool is_str=false, in_str=false, esc=false, in_rec=false;
		variant<string,int64_t,SQLNull> v;

		while (input) {
			char x; input>>x;
			if (x=='\n') {
				break;
			}

			if (esc) {
				if (x=='n') x='\n';
				else if (x=='t') x='\t';
				else if (x=='r') x='\r';

				str.push_back(x);
				esc=false;
			} else if (in_str && x=='\\') {
				esc=true;
			} else if (x=='\'') {
				in_str=!in_str;
				is_str=true;
			} else if (in_str) {
				str.push_back(x);
			} else if ((x==',' || x==';') && !in_rec) {
				continue;
			} else if (x=='(') {
				in_rec=true;
			} else if (in_rec && (x==',' || x==')')) {
				if (is_str) {
					is_str=in_str=esc=false;
					v.emplace<string>(std::move(str));
					str="";
				} else if (buf=="NULL") {
					v=SQLNull();
				} else {
					v=strtoll(buf.c_str(), nullptr, 10);
				}

				f(v,rec_i);

				buf.clear();
				rec_i = x==',' ? rec_i+1 : 0;
				if (x==')') in_rec=false;
			} else {
				buf.push_back(x);
			}
		}
	}
}

struct InMemoryData {
	int n;
	gtl::vector<int> buf;
	gtl::vector<int64_t> to_id;

	array<int*,2> adj(int i, bool rev) {
		if (rev) i+=n;
		return {buf.data()+2*n+(i==0 ? 0 : buf[i-1]), buf.data()+2*n+buf[i]};
	}
};

struct Data {
	ifstream data;
	int n;
	size_t off1, off2, off3;
	Data(): data("./data.bin", ios::binary) {
		data.read(reinterpret_cast<char*>(&n), sizeof(int));
		n=convert(n);

		off1=sizeof(int);
		off2=off1 + sizeof(int64_t)*n;
		off3=off2 + sizeof(int)*n*2;
	}

	InMemoryData to_mem() {
		InMemoryData mem {
			.n = n,
			.buf=gtl::vector<int>(2*n),
			.to_id=gtl::vector<int64_t>(n)
		};

		data.seekg(off1);
		for (int i=0; i<n; i++) {
			mem.to_id[i] = read_big();
		}

		for (int i=0; i<2*n; i++) mem.buf[i]=read();
		mem.buf.resize(mem.buf.back()+2*n);
		for (int i=0; i<mem.buf[2*n-1]; i++) mem.buf[2*n+i]=read();
		return mem;
	}

	int64_t to_id(int i) {
		data.seekg(off1 + sizeof(int64_t)*i);
		return read_big();
	}

	int read_big() {
		int64_t out;
		data.read(reinterpret_cast<char*>(&out), sizeof(int64_t));
		out=convert(out);
		return out;
	}

	int read() {
		int out;
		data.read(reinterpret_cast<char*>(&out), sizeof(int));
		out=convert(out);
		return out;
	}

	int read_i(int i) {
		data.seekg(i*sizeof(int), ios::cur);
		return read();
	}

	int from_id(int64_t id) {
		int i=0;
		int64_t cur=to_id(i);
		for (int jmp=bit_floor(unsigned(n)); jmp>0; jmp>>=1) {
			int nxt = i+jmp;
			if (nxt>=n) continue;
			int64_t nxt_v = to_id(nxt);
			if (nxt_v<=id) i=nxt, cur=nxt_v;
		}

		return cur==id ? i : -1;
	}

	int goto_adj(int i, bool rev) {
		if (rev) i+=n;

		int prev;
		if (i==0) {
			prev=0;
			data.seekg(off2+sizeof(int)*i);
		} else {
			data.seekg(off2+sizeof(int)*(i-1));
			prev=read();
		}

		int to_adj=read();
		if (to_adj>prev) data.seekg(off3+sizeof(int)*prev);
		return to_adj - prev;
	}
};

gtl::vector<int> path_between(Data& d, int p1_i, int p2_i) {
	gtl::bit_vector visited_a(d.n), visited_b(d.n);
	gtl::vector<int> qa, qb, nxt_a, nxt_b;
	gtl::parallel_flat_hash_map<int, int> from;

	qa.push_back(p1_i);
	qb.push_back(p2_i);

	visited_a.set(p1_i);
	visited_b.set(p2_i);

	for (int l=1; qa.size() && qb.size(); l++) {
		bool rev = l%2==1;
		auto& q = rev ? qb : qa;
		auto& nxt = rev ? nxt_b : nxt_a;
		auto& visit = rev ? visited_b : visited_a;
		auto& other_visit = rev ? visited_a : visited_b;

		for (int v: q) {
			int adj_l = d.goto_adj(v, rev);
			while (adj_l--) {
				int y = d.read();
				if (visit[y]) continue;

				if (other_visit[y]) {
					int source = rev ? p2_i : p1_i;
					int target = rev ? p1_i : p2_i;

					gtl::vector<int> path;

					while (true) {
						path.push_back(v);
						if (v==source) break;
						else v=from[v];
					}

					reverse(path.begin(), path.end());
					while (true) {
						path.push_back(y);
						if (y==target) break;
						else y=from[y];
					}

					if (rev) reverse(path.begin(), path.end());

					return path;
				}

				nxt.push_back(y);
				visit.set(y);
				from.emplace(y,v);
			}
		}
		
		q.swap(nxt);
		nxt.clear();
	}

	return {};
}

int main(int argc, char** argv) {
	stringstream ss;
	for (int i=1; i<argc; i++) ss<<argv[i]<<"\n";

	string action;
	ss>>action;

	gtl::parallel_flat_hash_map<string, int64_t> name_id;
	gtl::parallel_flat_hash_map<int64_t, int64_t> id_to;
	gtl::parallel_flat_hash_map<int64_t, gtl::vector<int64_t>> redirect_from;
	gtl::parallel_flat_hash_map<int64_t, int64_t> link_target_id;

	minstd_rand rng(321);

	if (action=="extract") {
		string pagelinks, page, linktarget, redirects;
		ss>>pagelinks>>page>>linktarget>>redirects;
		cout<<"using"<<pagelinks<<" "<<page<<" "<<linktarget<<" "<<redirects<<"\n";

		int64_t cur_id;
		bool in_ns=false;

		gtl::vector<int64_t> id_not_redirect;

		ifstream page_in(page);
		parse(page_in, [&](Value& v, int rec_i) {
			if (rec_i==3 && in_ns) {
				if (!get<int64_t>(v)) id_not_redirect.push_back(cur_id);
			} else if (rec_i==2 && in_ns) {
				name_id.emplace(std::move(get<string>(v)), cur_id);
			} else if (rec_i==1) {
				in_ns=get<int64_t>(v)==wiki_ns;
			} else if (rec_i==0) {
				cur_id = get<int64_t>(v);
			}
		});

		cout<<"done with pages\n";
		cout<<name_id.size()<<" total, "<<id_not_redirect.size()<<" are not redirects\n";
		sort(id_not_redirect.begin(), id_not_redirect.end());
		cout<<"sorted ids\n";

		cout<<"id for Freguesia is "<<name_id["Freguesia"]<<"\n";

		cout<<"reading redirects...\n";
		ifstream redirects_in(redirects);
		parse(redirects_in, [&](Value& v, int rec_i) {
			if (rec_i==0) cur_id=get<int64_t>(v);
			else if (rec_i==1) in_ns=get<int64_t>(v)==wiki_ns;
			else if (rec_i==2 && in_ns) {
				auto it = name_id.find(get<string>(v));
				if (it!=name_id.end()) {
					redirect_from[it->second].push_back(cur_id);
				}
			}
		});

		cout<<"DFSing redirects...\n";
		vector<int64_t> stack;
		for (int64_t id: id_not_redirect) {
			stack.push_back(id);
			id_to[id]=id;
			while (stack.size()) {
				auto it = redirect_from.find(stack.back());
				stack.pop_back();

				if (it!=redirect_from.end()) {
					for (int64_t y: it->second) {
						auto to = id_to.find(y);
						if (to==id_to.end()) {
							id_to[y]=id;
							stack.push_back(y);
						}
					}
				}
			}
		}

		redirect_from={};

		cout<<"handling link targets\n";
		gtl::parallel_flat_hash_map<int64_t,int> id_not_redirect_map;
		for (int i=0; i<id_not_redirect.size(); i++)
			id_not_redirect_map.emplace(id_not_redirect[i], i);

		cout<<"index of freguesia is "<<id_not_redirect_map[name_id["Freguesia"]]<<"\n";

		ifstream link_in(linktarget);
		parse(link_in, [&](Value& v, int rec_i) {
			if (rec_i==0) cur_id=get<int64_t>(v);
			else if (rec_i==1) in_ns=get<int64_t>(v)==wiki_ns;
			else if (rec_i==2 && in_ns) {
				auto it = name_id.find(get<string>(v));
				if (it==name_id.end()) return;
				auto it2 = id_to.find(it->second);
				if (it2==id_to.end()) return;

				link_target_id.emplace(cur_id, it2->second);
			}
		});

		cout<<"done with link targets\n";
		cout<<link_target_id.size()<<" targets\n";

		name_id={};

		ifstream pagelinks_in(pagelinks);
		gtl::parallel_flat_hash_map<int64_t, gtl::flat_hash_set<int64_t>> links_map;
		parse(pagelinks_in, [&](Value& v, int rec_i) {
			if (rec_i==0) cur_id=get<int64_t>(v);
			else if (rec_i==2) {
				if (!id_not_redirect_map.contains(cur_id)) return;

				auto it = link_target_id.find(get<int64_t>(v));
				if (it!=link_target_id.end()) {
					links_map[cur_id].insert(it->second);
				}
			}
		});

		cout<<"done with page links\n";
		cout<<links_map.size()<<" sources\n";

		ofstream data("./data.bin", ios::binary);

		auto write_int = [&data](int x) {
			x=convert(x);
			data.write(reinterpret_cast<char*>(&x), sizeof(int));
		};

		auto write_int64 = [&data](int64_t x) {
			x=convert(x);
			data.write(reinterpret_cast<char*>(&x), sizeof(int64_t));
		};

		write_int(id_not_redirect.size());

		cout<<"writing ids\n";
		for (int64_t id: id_not_redirect) write_int64(id);

		cout<<"computing adj lists\n";

		gtl::vector<gtl::vector<int>> adj(id_not_redirect.size());
		gtl::vector<gtl::vector<int>> rev_adj(id_not_redirect.size());

		for (int i=0; i<id_not_redirect.size(); i++) {
			auto it = links_map.find(id_not_redirect[i]);
			if (it!=links_map.end()) {
				for (int64_t y: it->second) {
					int to = id_not_redirect_map.find(y)->second;
					rev_adj[to].push_back(i);
					adj[i].push_back(to);
				}
			}
		}

		cout<<"writing adj list indices\n";
		int cur=0;
		for (int i=0; i<id_not_redirect.size(); i++) {
			cur+=adj[i].size();
			write_int(cur);
		}

		for (int i=0; i<id_not_redirect.size(); i++) {
			cur+=rev_adj[i].size();
			write_int(cur);
		}

		cout<<"total at "<<cur<<"\n";
		cout<<"writing adj lists\n";

		for (int i=0; i<id_not_redirect.size(); i++) {
			for (int y: adj[i]) write_int(y);
		}

		for (int i=0; i<id_not_redirect.size(); i++) {
			for (int y: rev_adj[i]) write_int(y);
		}

		cout<<"exiting...\n";
	} else if (action=="select") {
		Data d;
		int lb; ss>>lb;

		if (lb<=0) {
			for (int at=0; at<50; at++) {
				int s,t;
				for (int* x: {&s,&t}) *x=uniform_int_distribution<>(0,d.n-1)(rng);

				auto path = path_between(d, s, t);
				if (!path.empty()) {
					cout<<path.size()-1<<"\n";
					cout<<d.to_id(s)<<"\n"<<d.to_id(t)<<"\n";
					return 0;
				}
			}

			return -1;
		}
		
		gtl::parallel_flat_hash_map<int, gtl::vector<array<int,2>>> visited;
		gtl::vector<int> a,b;
		gtl::parallel_flat_hash_set<int> visited_2;
		gtl::vector<int> sources;

		auto add_source = [&]() -> bool {
			int source = uniform_int_distribution<>(0,d.n-1)(rng);
			int source_i=sources.size();
			sources.push_back(source);

			a={source};
			visited_2={source};
			visited[source].push_back(array<int,2>{source_i,0});

			int l1=1;
			for (; visited_2.size()<1e3 && a.size(); l1++) {
				for (int x: a) {
					int v = d.goto_adj(x, false);
					while (v--) {
						int y = d.read();
						if (!visited_2.contains(y)) {
							b.push_back(y);
							visited_2.insert(y);
							visited[y].push_back(array<int,2>{source_i,l1});

							if (l1>=lb) {
								cout<<l1<<"\n"<<d.to_id(source)<<"\n";
								cout<<d.to_id(y)<<"\n";
								return true;
							}
						}
					}
				}

				a.swap(b);
				b.clear();
			}

			return false;
		};

		gtl::vector<int> bad;
		auto add_target = [&]() -> bool {
			int n_bad;
			bad.assign(sources.size(), 0);

			int target = uniform_int_distribution<>(0,d.n-1)(rng);
			if (visited.contains(target)) return false;

			a={target};

			n_bad=0;
			visited_2.clear();
			visited_2.insert(target);

			for (int l=1; n_bad<sources.size() && a.size(); l++) {
				for (int x: a) {
					int v = d.goto_adj(x, true);
					while (v--) {
						int y = d.read();
						auto it = visited.find(y);
						if (it!=visited.end()) {
							for (auto [source_i, l1]: it->second) {
								if (bad[source_i]) continue;
								if (l+l1<lb) {
									bad[source_i]=1; n_bad++;
								} else {
									cout<<l+l1<<"\n"<<d.to_id(sources[source_i])<<"\n"<<d.to_id(target)<<"\n";
									return true;
								}
							}
						}
						
						if (!visited_2.contains(y)) {
							b.push_back(y);
							visited_2.insert(y);
						}
					}

					if (n_bad>=sources.size()) break;
				}

				a.swap(b);
				b.clear();
			}
		
			return false;
		};

		for (int i=0; i<100; i++) {
			if (add_source() || add_target() || add_target()) return 0;
		}

		return -1;
	} else if (action=="distance") {
		int64_t p1, p2; ss>>p1>>p2;

		Data d;
		int p1_i = d.from_id(p1), p2_i = d.from_id(p2);

		if (p1_i==-1 || p2_i==-1) {
			throw runtime_error("page not found");
		} else if (p1_i==p2_i) {
			cout<<"0\n"<<p1<<"\n";
			return 0;
		}

		auto path = path_between(d, p1_i, p2_i);
		if (path.empty()) {
			cout<<"-1\n";
		} else {
			cout<<path.size()-1<<"\n";
			for (int x: path) cout<<d.to_id(x)<<"\n";
		}
	} else {
		throw runtime_error("oh fuck");
	}
}